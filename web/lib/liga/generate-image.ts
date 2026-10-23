import { createAdminClient } from "@/lib/supabase/server";
import sharp from "sharp";

const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-flash";
const FAL_API = "https://fal.run/fal-ai/flux/schnell";
const BUCKET = "noticias";

export interface NewsImageContext {
  newsId: string;
  title: string;
  excerpt: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  scoreStr?: string | null;
  jornadaInfo?: string | null;
}

// Full pipeline: DeepSeek → fal.ai → webp → Supabase Storage
export async function generateNewsImage(ctx: NewsImageContext): Promise<void> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const falKey = process.env.FAL_KEY;

  if (!deepseekKey || !falKey) {
    console.error("[generateNewsImage] Missing DEEPSEEK_API_KEY or FAL_KEY");
    await setImageStatus(ctx.newsId, "failed");
    return;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { prompt, negativePrompt } = await buildImagePrompt(ctx, deepseekKey);
      await generateAndStore(ctx.newsId, prompt, negativePrompt, falKey);
      return;
    } catch (err) {
      console.error(`[generateNewsImage] attempt ${attempt} failed:`, err);
      if (attempt === 2) await setImageStatus(ctx.newsId, "failed");
    }
  }
}

// Skip DeepSeek — use caller-supplied prompt directly
export async function generateNewsImageFromPrompt(
  newsId: string,
  customPrompt: string
): Promise<void> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    await setImageStatus(newsId, "failed");
    return;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await generateAndStore(newsId, customPrompt, undefined, falKey);
      return;
    } catch (err) {
      console.error(`[generateNewsImage/custom] attempt ${attempt} failed:`, err);
      if (attempt === 2) await setImageStatus(newsId, "failed");
    }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function generateAndStore(
  newsId: string,
  prompt: string,
  negativePrompt: string | undefined,
  falKey: string
): Promise<void> {
  // Flux doesn't support negative_prompt natively — embed it in the positive prompt
  const falPrompt = negativePrompt
    ? `${prompt}\n\nDo not include: ${negativePrompt}`
    : prompt;

  const rawBuffer = await callFalApi(falPrompt, falKey);

  const webpBuffer = await sharp(rawBuffer)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const admin = await createAdminClient();
  const storagePath = `${newsId}.webp`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, webpBuffer, { contentType: "image/webp", upsert: true });

  if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  const { error: updateErr } = await admin
    .from("news")
    .update({ cover_image_url: pub.publicUrl, image_prompt: prompt, image_status: "ready" })
    .eq("id", newsId);

  if (updateErr) throw new Error(`DB update: ${updateErr.message}`);

  console.log(`[generateNewsImage] ✓ ${newsId}`);
}

async function setImageStatus(newsId: string, status: "pending" | "ready" | "failed") {
  try {
    const admin = await createAdminClient();
    await admin.from("news").update({ image_status: status }).eq("id", newsId);
  } catch { /* best effort */ }
}

// ─── DeepSeek prompt generation ───────────────────────────────────────────────

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

Respond ONLY with valid JSON, no markdown:
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
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: IMAGE_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.75,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { prompt?: string; negative_prompt?: string };

  if (!parsed.prompt || parsed.prompt.length < 30) {
    throw new Error(`DeepSeek returned invalid prompt: ${raw.slice(0, 200)}`);
  }

  return {
    prompt: parsed.prompt.slice(0, 500),
    negativePrompt: (
      parsed.negative_prompt ?? "text, letters, numbers, logos, scoreboards, recognizable faces"
    ).slice(0, 250),
  };
}

// ─── fal.ai call ─────────────────────────────────────────────────────────────

async function callFalApi(prompt: string, falKey: string): Promise<Buffer> {
  const res = await fetch(FAL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${falKey}` },
    body: JSON.stringify({
      prompt,
      image_size: "landscape_16_9",
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { images?: { url: string }[] };
  const imageUrl = json.images?.[0]?.url;
  if (!imageUrl) throw new Error("fal.ai returned no image URL");

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);

  return Buffer.from(await imgRes.arrayBuffer());
}
