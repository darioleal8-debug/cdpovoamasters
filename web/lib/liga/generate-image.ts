import { createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const FAL_API = "https://fal.run/fal-ai/flux/schnell";
const BUCKET = "noticias";

function getDeepseekModel() {
  return process.env.DEEPSEEK_TEXT_MODEL ?? "deepseek-chat";
}

export interface NewsImageContext {
  newsId: string;
  title: string;
  excerpt: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  scoreStr?: string | null;
  jornadaInfo?: string | null;
}

export type FalErrorType = "BILLING" | "AUTH" | "RATE_LIMIT" | "TRANSIENT" | "CONTENT" | "UNKNOWN";
export type GenerateResult = { ok: true } | { ok: false; errorType: FalErrorType };

interface FalError extends Error {
  errorType: FalErrorType;
}

export function classifyFalError(status: number, body: string): FalErrorType {
  const lower = body.toLowerCase();
  if (status === 403) {
    if (lower.includes("top_up") || lower.includes("locked") || lower.includes("billing")) return "BILLING";
    return "AUTH";
  }
  if (status === 401) return "AUTH";
  if (status === 429) return "RATE_LIMIT";
  if (lower.includes("content") || lower.includes("safety") || lower.includes("nsfw") || lower.includes("policy")) return "CONTENT";
  if (status >= 500) return "TRANSIENT";
  return "UNKNOWN";
}

// ─── Exported entry points ────────────────────────────────────────────────────

export async function generateNewsImage(ctx: NewsImageContext): Promise<GenerateResult> {
  try {
    return await _generateNewsImage(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[generateNewsImage] uncaught: ${msg}`);
    await setImageFailed(ctx.newsId, "TRANSIENT", msg);
    return { ok: false, errorType: "TRANSIENT" };
  }
}

async function _generateNewsImage(ctx: NewsImageContext): Promise<GenerateResult> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const falKey = process.env.FAL_KEY;

  if (!falKey) {
    console.error("[generateNewsImage] FAL_KEY não configurada");
    await setImageFailed(ctx.newsId, "AUTH", "FAL_KEY não configurada");
    return { ok: false, errorType: "AUTH" };
  }

  const admin = await createAdminClient();
  const tTotal = Date.now();

  // Guardar URL anterior para apagar depois
  const { data: currentRow } = await admin
    .from("news")
    .select("cover_image_url")
    .eq("id", ctx.newsId)
    .single();
  const oldImageUrl = currentRow?.cover_image_url ?? null;

  // ── Passo 1: gerar prompt ─────────────────────────────────────────────────
  let prompt: string;
  let negativePrompt: string;

  if (deepseekKey) {
    const t0 = Date.now();
    console.log(`[generateNewsImage] deepseek:start ${ctx.newsId} model=${getDeepseekModel()}`);
    try {
      const result = await buildImagePrompt(ctx, deepseekKey);
      prompt = result.prompt;
      negativePrompt = result.negativePrompt;
      console.log(`[generateNewsImage] deepseek:ok ${Date.now() - t0}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage] deepseek:fail ${Date.now() - t0}ms — ${msg}`);
      const fb = buildFallbackPrompt(ctx);
      prompt = fb.prompt;
      negativePrompt = fb.negativePrompt;
      console.log("[generateNewsImage] usando prompt determinístico de fallback");
    }
  } else {
    console.warn("[generateNewsImage] DEEPSEEK_API_KEY não configurada, usando prompt determinístico");
    const fb = buildFallbackPrompt(ctx);
    prompt = fb.prompt;
    negativePrompt = fb.negativePrompt;
  }

  await admin.from("news").update({ image_prompt: prompt }).eq("id", ctx.newsId);

  // ── Passo 2: gerar imagem (retry só para TRANSIENT/RATE_LIMIT) ────────────
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t1 = Date.now();
    console.log(`[generateNewsImage] fal:start attempt=${attempt} ${ctx.newsId}`);
    try {
      const { buffer: rawBuffer, seed } = await callFalApi(prompt, negativePrompt, falKey);
      console.log(`[generateNewsImage] fal:ok seed=${seed} ${Date.now() - t1}ms`);

      const webpBuffer = await sharp(rawBuffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      const { publicUrl } = await saveImageToStorage(admin, ctx.newsId, webpBuffer);

      const { error: updateErr } = await admin
        .from("news")
        .update({
          cover_image_url: publicUrl,
          image_status: "ready",
          image_seed: seed,
          image_error: null,
          image_error_type: null,
        })
        .eq("id", ctx.newsId);

      if (updateErr) throw new Error(`DB update: ${updateErr.message}`);

      await deletePreviousImage(admin, oldImageUrl);
      console.log(`[generateNewsImage] upload:ok total=${Date.now() - tTotal}ms ${ctx.newsId}`);
      return { ok: true };
    } catch (err) {
      const errorType = (err as Partial<FalError>).errorType ?? "UNKNOWN";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage] fal:fail attempt=${attempt} type=${errorType} ${Date.now() - t1}ms — ${msg}`);

      if (errorType === "BILLING" || errorType === "AUTH" || errorType === "CONTENT") {
        await setImageFailed(ctx.newsId, errorType, msg);
        return { ok: false, errorType };
      }

      if (attempt === 2) {
        await setImageFailed(ctx.newsId, errorType, msg);
        return { ok: false, errorType };
      }

      const delay = errorType === "RATE_LIMIT" ? 10_000 : 5_000;
      console.log(`[generateNewsImage] aguarda ${delay}ms antes de retry`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return { ok: false, errorType: "UNKNOWN" };
}

// Skip prompt automático — o brief do admin é interpretado pelo DeepSeek como direção criativa
export async function generateNewsImageFromPrompt(
  newsId: string,
  brief: string,
  ctx?: Partial<NewsImageContext>
): Promise<GenerateResult> {
  try {
    return await _generateNewsImageFromPrompt(newsId, brief, ctx ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setImageFailed(newsId, "TRANSIENT", msg);
    return { ok: false, errorType: "TRANSIENT" };
  }
}

async function _generateNewsImageFromPrompt(
  newsId: string,
  brief: string,
  ctx: Partial<NewsImageContext>
): Promise<GenerateResult> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const falKey = process.env.FAL_KEY;

  if (!falKey) {
    console.error("[generateNewsImage/brief] FAL_KEY não configurada");
    await setImageFailed(newsId, "AUTH", "FAL_KEY não configurada");
    return { ok: false, errorType: "AUTH" };
  }

  const admin = await createAdminClient();
  const tTotal = Date.now();

  const { data: currentRow } = await admin
    .from("news")
    .select("cover_image_url")
    .eq("id", newsId)
    .single();
  const oldImageUrl = currentRow?.cover_image_url ?? null;

  // ── Brief → prompt visual via DeepSeek ───────────────────────────────────
  let prompt: string;
  let negativePrompt: string;

  if (deepseekKey) {
    const t0 = Date.now();
    console.log(`[generateNewsImage/brief] deepseek:start ${newsId}`);
    try {
      const result = await buildImagePromptFromBrief(brief, ctx, deepseekKey);
      prompt = result.prompt;
      negativePrompt = result.negativePrompt;
      console.log(`[generateNewsImage/brief] deepseek:ok ${Date.now() - t0}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage/brief] deepseek:fail ${Date.now() - t0}ms — ${msg}`);
      // Fallback: usa o brief directamente com wrapper mínimo em inglês
      prompt = `Liga INATEL basketball. ${brief.slice(0, 400)}`;
      negativePrompt = "text, letters, numbers, logos, scoreboards, recognizable faces";
    }
  } else {
    console.warn("[generateNewsImage/brief] DEEPSEEK_API_KEY não configurada, usando brief directamente");
    prompt = `Liga INATEL basketball. ${brief.slice(0, 400)}`;
    negativePrompt = "text, letters, numbers, logos, scoreboards, recognizable faces";
  }

  await admin.from("news").update({ image_prompt: prompt }).eq("id", newsId);

  // ── Gerar imagem ──────────────────────────────────────────────────────────
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t1 = Date.now();
    console.log(`[generateNewsImage/brief] fal:start attempt=${attempt} ${newsId}`);
    try {
      const { buffer: rawBuffer, seed } = await callFalApi(prompt, negativePrompt, falKey);
      console.log(`[generateNewsImage/brief] fal:ok seed=${seed} ${Date.now() - t1}ms`);

      const webpBuffer = await sharp(rawBuffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      const { publicUrl } = await saveImageToStorage(admin, newsId, webpBuffer);

      await admin
        .from("news")
        .update({
          cover_image_url: publicUrl,
          image_status: "ready",
          image_seed: seed,
          image_error: null,
          image_error_type: null,
        })
        .eq("id", newsId);

      await deletePreviousImage(admin, oldImageUrl);
      console.log(`[generateNewsImage/brief] upload:ok total=${Date.now() - tTotal}ms ${newsId}`);
      return { ok: true };
    } catch (err) {
      const errorType = (err as Partial<FalError>).errorType ?? "UNKNOWN";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage/brief] fal:fail attempt=${attempt} type=${errorType} — ${msg}`);

      if (errorType === "BILLING" || errorType === "AUTH" || errorType === "CONTENT") {
        await setImageFailed(newsId, errorType, msg);
        return { ok: false, errorType };
      }

      if (attempt === 2) {
        await setImageFailed(newsId, errorType, msg);
        return { ok: false, errorType };
      }

      const delay = errorType === "RATE_LIMIT" ? 10_000 : 5_000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return { ok: false, errorType: "UNKNOWN" };
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function saveImageToStorage(
  admin: SupabaseClient,
  newsId: string,
  buffer: Buffer
): Promise<{ publicUrl: string; storagePath: string }> {
  const storagePath = `${newsId}/${Date.now()}.webp`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });
  if (error) throw new Error(`Storage upload: ${error.message}`);
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
  return { publicUrl: pub.publicUrl, storagePath };
}

async function deletePreviousImage(admin: SupabaseClient, oldUrl: string | null) {
  if (!oldUrl) return;
  try {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = oldUrl.indexOf(marker);
    if (idx === -1) return;
    const oldPath = decodeURIComponent(oldUrl.slice(idx + marker.length));
    if (!oldPath) return;
    await admin.storage.from(BUCKET).remove([oldPath]);
  } catch { /* best effort */ }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function setImageFailed(newsId: string, errorType: FalErrorType, errorMsg: string) {
  try {
    const admin = await createAdminClient();
    await admin
      .from("news")
      .update({
        image_status: "failed",
        image_error_type: errorType,
        image_error: errorMsg.slice(0, 500),
      })
      .eq("id", newsId);
  } catch { /* best effort */ }
}

// ─── DeepSeek: prompt editorial (pipeline automático) ────────────────────────

const IMAGE_SYSTEM_PROMPT = `You are a creative director for sports editorial photography.
Given a basketball news article from an amateur/masters league in Portugal, generate a vivid image prompt for an AI image generator (Flux).

Scene requirements:
- Indoor basketball pavilion, amateur/masters level, dramatic court lighting
- Editorial sports photography style, horizontal 16:9 composition
- Capture the game's atmosphere (close match, dominant win, season opener, comeback, etc.)
- Hint at jersey colors if team names suggest a region or identity
- Focus on movement, energy, and emotion of the players

Strict prohibitions (put in negative_prompt):
- NO text, letters, numbers, digits, scoreboards, banners with text
- NO real logos or recognizable brand marks
- NO recognizable faces — players from behind, in motion blur, or silhouette only

Respond ONLY with valid JSON, no markdown code fences:
{"prompt": "...", "negative_prompt": "..."}
- prompt: 80–200 words, evocative and specific
- negative_prompt: 15–40 words`;

async function buildImagePrompt(
  ctx: NewsImageContext,
  apiKey: string
): Promise<{ prompt: string; negativePrompt: string }> {
  const userContent = [
    `Title: ${ctx.title}`,
    `Lead: ${ctx.excerpt}`,
    ctx.homeTeamName ? `Home team: ${ctx.homeTeamName}` : null,
    ctx.awayTeamName ? `Away team: ${ctx.awayTeamName}` : null,
    ctx.scoreStr ? `Final score: ${ctx.scoreStr}` : null,
    ctx.jornadaInfo ? `Context: ${ctx.jornadaInfo}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return callDeepSeekForPrompt(IMAGE_SYSTEM_PROMPT, userContent, apiKey);
}

// ─── DeepSeek: prompt a partir de brief criativo do admin ────────────────────

const BRIEF_SYSTEM_PROMPT = `You are a creative director translating a human brief into a prompt for the Flux AI image generator.

The brief may be in any language (Portuguese, English, etc.) and describes the desired image for a Liga INATEL basketball news article.

Your task:
1. Understand the brief's INTENT and STYLE direction.
2. Generate a vivid, specific image prompt in English for Flux.
3. Choose the visual style based on the brief:
   - If the brief requests photorealistic/editorial/photograph → cinematic sports photography style
   - If the brief requests poster/cartaz/illustration/não-realista/design/graphic/vector → graphic design, illustration, flat art, poster style
   - If the brief requests a specific look (retro, watercolor, 3D render, etc.) → follow it exactly
   - When no style is specified → default to editorial sports photography
4. Incorporate the article context (title, teams) to add specificity.

Strict prohibitions (always in negative_prompt):
- NO readable text, letters, digits, scoreboards
- NO real logos or recognizable brand marks
- NO recognizable faces

Respond ONLY with valid JSON (no markdown):
{"prompt": "...", "negative_prompt": "..."}
- prompt: 80–200 words, English only, specific and visual
- negative_prompt: 15–40 words`;

async function buildImagePromptFromBrief(
  brief: string,
  ctx: Partial<NewsImageContext>,
  apiKey: string
): Promise<{ prompt: string; negativePrompt: string }> {
  const userContent = [
    `Creative brief: ${brief}`,
    ctx.title ? `Article title: ${ctx.title}` : null,
    ctx.homeTeamName ? `Home team: ${ctx.homeTeamName}` : null,
    ctx.awayTeamName ? `Away team: ${ctx.awayTeamName}` : null,
    ctx.scoreStr ? `Score: ${ctx.scoreStr}` : null,
    ctx.jornadaInfo ? `Context: ${ctx.jornadaInfo}` : null,
    ctx.excerpt ? `Lead: ${ctx.excerpt.slice(0, 120)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return callDeepSeekForPrompt(BRIEF_SYSTEM_PROMPT, userContent, apiKey);
}

async function callDeepSeekForPrompt(
  systemPrompt: string,
  userContent: string,
  apiKey: string
): Promise<{ prompt: string; negativePrompt: string }> {
  const res = await fetch(DEEPSEEK_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: getDeepseekModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: {
      finish_reason?: string;
      message?: { content?: string; reasoning_content?: string };
    }[];
  };

  const choice = json.choices?.[0];
  const finishReason = choice?.finish_reason ?? "unknown";
  const raw = choice?.message?.content ?? "";

  if (!raw.trim()) {
    const reasoningSnippet = choice?.message?.reasoning_content?.slice(0, 200) ?? "";
    throw new Error(
      `DeepSeek devolveu conteúdo vazio (finish_reason=${finishReason}${reasoningSnippet ? `, reasoning="${reasoningSnippet}"` : ""})`
    );
  }

  const parsed = safeParseJson(raw);

  if (!parsed?.prompt || parsed.prompt.length < 30) {
    if (raw.length > 50) {
      console.warn(`[generateNewsImage] deepseek devolveu texto não-JSON, a usar como prompt directo (${raw.length} chars)`);
      return {
        prompt: raw.slice(0, 500),
        negativePrompt: "text, letters, numbers, logos, scoreboards, recognizable faces",
      };
    }
    throw new Error(`DeepSeek prompt inválido (finish_reason=${finishReason}): ${raw.slice(0, 300)}`);
  }

  return {
    prompt: parsed.prompt.slice(0, 500),
    negativePrompt: (
      parsed.negative_prompt ?? "text, letters, numbers, logos, scoreboards, recognizable faces"
    ).slice(0, 250),
  };
}

function safeParseJson(raw: string): { prompt?: string; negative_prompt?: string } | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as { prompt?: string; negative_prompt?: string };
  } catch (err) {
    console.error(`[generateNewsImage] safeParseJson falhou:`, (err as Error).message, `raw=${raw.slice(0, 500)}`);
    return null;
  }
}

function buildFallbackPrompt(ctx: NewsImageContext): { prompt: string; negativePrompt: string } {
  const teams = [ctx.homeTeamName, ctx.awayTeamName].filter(Boolean).join(" vs ");
  const fragments = [
    "Editorial sports photography of an indoor basketball game in a Portuguese pavilion.",
    "Amateur masters league match. Dramatic ceiling lighting illuminating the hardwood court.",
    "Dynamic action moment: players mid-play, ball visible, motion blur on outstretched arms.",
    teams && `Teams: ${teams}.`,
    ctx.scoreStr && `Final: ${ctx.scoreStr}.`,
    ctx.jornadaInfo,
    ctx.excerpt.slice(0, 120),
    "High contrast, cinematic depth of field, warm tungsten tones. No visible faces — players from behind or in silhouette.",
  ].filter(Boolean);

  return {
    prompt: fragments.join(" ").slice(0, 500),
    negativePrompt: "text, letters, numbers, scoreboards, logos, recognizable faces, crowd banners",
  };
}

// ─── fal.ai ───────────────────────────────────────────────────────────────────

async function callFalApi(
  prompt: string,
  negativePrompt: string | undefined,
  falKey: string
): Promise<{ buffer: Buffer; seed: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);
  const seed = Math.floor(Math.random() * 2 ** 31);

  try {
    const finalPrompt = negativePrompt
      ? `${prompt}\n\nDo not include: ${negativePrompt}`
      : prompt;

    const res = await fetch(FAL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
      body: JSON.stringify({
        prompt: finalPrompt,
        image_size: "landscape_16_9",
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
        seed,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      const errorType = classifyFalError(res.status, errText);
      throw Object.assign(
        new Error(`fal.ai HTTP ${res.status}: ${errText.slice(0, 300)}`),
        { errorType }
      ) as FalError;
    }

    const json = (await res.json()) as { images?: { url: string }[] };
    const imageUrl = json.images?.[0]?.url;
    if (!imageUrl) throw new Error("fal.ai: resposta sem URL de imagem");

    const imgRes = await fetch(imageUrl, { signal: controller.signal });
    if (!imgRes.ok) throw new Error(`fal.ai download falhou: HTTP ${imgRes.status}`);

    return { buffer: Buffer.from(await imgRes.arrayBuffer()), seed };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw Object.assign(
        new Error("fal.ai timeout (90s)"),
        { errorType: "TRANSIENT" as FalErrorType }
      ) as FalError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
