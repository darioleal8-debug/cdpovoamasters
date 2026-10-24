import { createAdminClient } from "@/lib/supabase/server";
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

// Full pipeline: DeepSeek → fal.ai → webp → Supabase Storage
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

  // Grava prompt antes do fal.ai para debugging
  await admin.from("news").update({ image_prompt: prompt }).eq("id", ctx.newsId);

  // ── Passo 2: gerar imagem (2 tentativas; retry só para TRANSIENT/RATE_LIMIT) ─
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t1 = Date.now();
    console.log(`[generateNewsImage] fal:start attempt=${attempt} ${ctx.newsId}`);
    try {
      const rawBuffer = await callFalApi(prompt, negativePrompt, falKey);
      console.log(`[generateNewsImage] fal:ok ${Date.now() - t1}ms`);

      const t2 = Date.now();
      const webpBuffer = await sharp(rawBuffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      const storagePath = `${ctx.newsId}.webp`;
      const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, webpBuffer, { contentType: "image/webp", upsert: true });

      if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

      const { error: updateErr } = await admin
        .from("news")
        .update({ cover_image_url: pub.publicUrl, image_status: "ready", image_error: null, image_error_type: null })
        .eq("id", ctx.newsId);

      if (updateErr) throw new Error(`DB update: ${updateErr.message}`);

      console.log(`[generateNewsImage] upload:ok ${Date.now() - t2}ms total=${Date.now() - tTotal}ms ${ctx.newsId}`);
      return { ok: true };
    } catch (err) {
      const errorType = (err as Partial<FalError>).errorType ?? "UNKNOWN";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage] fal:fail attempt=${attempt} type=${errorType} ${Date.now() - t1}ms — ${msg}`);

      // Erros não-recuperáveis: para imediatamente, sem retry
      if (errorType === "BILLING" || errorType === "AUTH" || errorType === "CONTENT") {
        await setImageFailed(ctx.newsId, errorType, msg);
        return { ok: false, errorType };
      }

      if (attempt === 2) {
        await setImageFailed(ctx.newsId, errorType, msg);
        return { ok: false, errorType };
      }

      // Backoff antes do retry: RATE_LIMIT→10s, TRANSIENT→5s
      const delay = errorType === "RATE_LIMIT" ? 10_000 : 5_000;
      console.log(`[generateNewsImage] aguarda ${delay}ms antes de retry`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return { ok: false, errorType: "UNKNOWN" };
}

// Skip DeepSeek — usa prompt fornecido pelo admin directamente
export async function generateNewsImageFromPrompt(
  newsId: string,
  customPrompt: string
): Promise<GenerateResult> {
  try {
    return await _generateNewsImageFromPrompt(newsId, customPrompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setImageFailed(newsId, "TRANSIENT", msg);
    return { ok: false, errorType: "TRANSIENT" };
  }
}

async function _generateNewsImageFromPrompt(newsId: string, customPrompt: string): Promise<GenerateResult> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error("[generateNewsImage/custom] FAL_KEY não configurada");
    await setImageFailed(newsId, "AUTH", "FAL_KEY não configurada");
    return { ok: false, errorType: "AUTH" };
  }

  const admin = await createAdminClient();
  await admin.from("news").update({ image_prompt: customPrompt }).eq("id", newsId);

  const tTotal = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t1 = Date.now();
    console.log(`[generateNewsImage/custom] fal:start attempt=${attempt} ${newsId}`);
    try {
      const rawBuffer = await callFalApi(customPrompt, undefined, falKey);
      console.log(`[generateNewsImage/custom] fal:ok ${Date.now() - t1}ms`);

      const webpBuffer = await sharp(rawBuffer)
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      const storagePath = `${newsId}.webp`;
      const { error: uploadErr } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, webpBuffer, { contentType: "image/webp", upsert: true });

      if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

      await admin
        .from("news")
        .update({ cover_image_url: pub.publicUrl, image_status: "ready", image_error: null, image_error_type: null })
        .eq("id", newsId);

      console.log(`[generateNewsImage/custom] upload:ok total=${Date.now() - tTotal}ms ${newsId}`);
      return { ok: true };
    } catch (err) {
      const errorType = (err as Partial<FalError>).errorType ?? "UNKNOWN";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage/custom] fal:fail attempt=${attempt} type=${errorType} — ${msg}`);

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

// ─── Internal helpers ─────────────────────────────────────────────────────────

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

// ─── DeepSeek: geração de prompt ─────────────────────────────────────────────

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

  const res = await fetch(DEEPSEEK_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: getDeepseekModel(),
      messages: [
        { role: "system", content: IMAGE_SYSTEM_PROMPT },
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
    throw new Error(
      `DeepSeek prompt inválido (finish_reason=${finishReason}): ${raw.slice(0, 300)}`
    );
  }

  return {
    prompt: parsed.prompt.slice(0, 500),
    negativePrompt: (
      parsed.negative_prompt ?? "text, letters, numbers, logos, scoreboards, recognizable faces"
    ).slice(0, 250),
  };
}

// Parsing robusto: remove fences markdown, extrai primeiro {...}, faz JSON.parse
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

// Prompt determinístico quando o DeepSeek não está disponível ou falha
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
): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

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

    return Buffer.from(await imgRes.arrayBuffer());
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
