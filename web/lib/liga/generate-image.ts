import { createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
// flux/dev: modelo fotorrealista (28 steps), muito mais qualidade que schnell (4 steps)
const FAL_API = "https://fal.run/fal-ai/flux/dev";
const BUCKET = "noticias";

function getDeepseekModel() {
  return process.env.DEEPSEEK_TEXT_MODEL ?? "deepseek-chat";
}

// ─── Public types ─────────────────────────────────────────────────────────────

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

// ─── Internal types ───────────────────────────────────────────────────────────

interface FalError extends Error {
  errorType: FalErrorType;
}

interface TeamKit {
  primary_color: string | null;
  secondary_color: string | null;
  kit_description: string | null;
  logo_url: string | null;
}

interface GameImageData {
  location: string | null;
  homeScore: number | null;
  awayScore: number | null;
  jornada: number | null;
  volta: number | null;
  homeKit: TeamKit | null;
  awayKit: TeamKit | null;
}

interface OverlayData {
  homeTeamName: string;
  awayTeamName: string;
  score: string | null;
  jornadaInfo: string | null;
  homeLogoB64: string | null;
  awayLogoB64: string | null;
  homePrimaryColor: string;
  awayPrimaryColor: string;
}

// ─── Error classification ─────────────────────────────────────────────────────

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

// Termos proibidos no prompt gerado pelo DeepSeek
const BANNED_RE = /\b(NBA|NCAA|FIBA|american\s+arena|professional\s+basketball|sponsored\s+by|Lakers|Celtics|Warriors|Bulls|Raptors|Bucks|Nuggets|Suns|Knicks|Heat|Nets|Spurs|Thunder|Cavaliers|Mavericks|Blazers|Clippers|Kings|Pelicans|Rockets|Jazz|Wizards|Hawks|Hornets|Magic|Pacers|Grizzlies|Pistons)\b/i;

function validatePrompt(prompt: string): boolean {
  return !BANNED_RE.test(prompt);
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
    await setImageFailed(ctx.newsId, "AUTH", "FAL_KEY não configurada");
    return { ok: false, errorType: "AUTH" };
  }

  const admin = await createAdminClient();
  const tTotal = Date.now();

  // Buscar URL anterior e dados do jogo em paralelo
  const [newsRow, gameData] = await Promise.all([
    admin.from("news").select("cover_image_url, game_id").eq("id", ctx.newsId).single(),
    fetchGameImageData(ctx.newsId, admin),
  ]);
  const oldImageUrl = newsRow.data?.cover_image_url ?? null;

  // ── Passo 1: gerar prompt com dados reais ─────────────────────────────────
  let prompt: string;
  let negativePrompt: string;

  if (deepseekKey) {
    const t0 = Date.now();
    console.log(`[generateNewsImage] deepseek:start ${ctx.newsId} model=${getDeepseekModel()}`);
    try {
      const result = await buildImagePrompt(ctx, gameData, deepseekKey);
      if (!validatePrompt(result.prompt)) {
        console.warn(`[generateNewsImage] deepseek:banned_terms — usando fallback`);
        const fb = buildFallbackPrompt(ctx, gameData);
        prompt = fb.prompt; negativePrompt = fb.negativePrompt;
      } else {
        prompt = result.prompt; negativePrompt = result.negativePrompt;
        console.log(`[generateNewsImage] deepseek:ok ${Date.now() - t0}ms`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage] deepseek:fail ${Date.now() - t0}ms — ${msg}`);
      const fb = buildFallbackPrompt(ctx, gameData);
      prompt = fb.prompt; negativePrompt = fb.negativePrompt;
    }
  } else {
    const fb = buildFallbackPrompt(ctx, gameData);
    prompt = fb.prompt; negativePrompt = fb.negativePrompt;
  }

  await admin.from("news").update({ image_prompt: prompt }).eq("id", ctx.newsId);

  // ── Passo 2: gerar e compor imagem ────────────────────────────────────────
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t1 = Date.now();
    console.log(`[generateNewsImage] fal:start attempt=${attempt} ${ctx.newsId}`);
    try {
      const { buffer: rawBuffer, seed } = await callFalApi(prompt, negativePrompt, falKey);
      console.log(`[generateNewsImage] fal:ok seed=${seed} ${Date.now() - t1}ms`);

      const webpBuffer = await buildFinalImage(rawBuffer, ctx, gameData);

      const { publicUrl } = await saveImageToStorage(admin, ctx.newsId, webpBuffer);

      const { error: updateErr } = await admin
        .from("news")
        .update({ cover_image_url: publicUrl, image_status: "ready", image_seed: seed, image_error: null, image_error_type: null })
        .eq("id", ctx.newsId);

      if (updateErr) throw new Error(`DB update: ${updateErr.message}`);

      await deletePreviousImage(admin, oldImageUrl);
      console.log(`[generateNewsImage] done total=${Date.now() - tTotal}ms ${ctx.newsId}`);
      return { ok: true };
    } catch (err) {
      const errorType = (err as Partial<FalError>).errorType ?? "UNKNOWN";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage] fail attempt=${attempt} type=${errorType} ${Date.now() - t1}ms — ${msg}`);

      if (errorType === "BILLING" || errorType === "AUTH" || errorType === "CONTENT") {
        await setImageFailed(ctx.newsId, errorType, msg);
        return { ok: false, errorType };
      }
      if (attempt === 2) {
        await setImageFailed(ctx.newsId, errorType, msg);
        return { ok: false, errorType };
      }
      const delay = errorType === "RATE_LIMIT" ? 10_000 : 5_000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return { ok: false, errorType: "UNKNOWN" };
}

// Brief criativo do admin → DeepSeek interpreta → gera prompt Flux
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
  ctxPartial: Partial<NewsImageContext>
): Promise<GenerateResult> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    await setImageFailed(newsId, "AUTH", "FAL_KEY não configurada");
    return { ok: false, errorType: "AUTH" };
  }

  const admin = await createAdminClient();
  const tTotal = Date.now();

  const [newsRow, gameData] = await Promise.all([
    admin.from("news").select("cover_image_url").eq("id", newsId).single(),
    fetchGameImageData(newsId, admin),
  ]);
  const oldImageUrl = newsRow.data?.cover_image_url ?? null;

  // Brief do admin → DeepSeek interpreta como direção criativa
  let prompt: string;
  let negativePrompt: string;

  if (deepseekKey) {
    const t0 = Date.now();
    try {
      const ctx: NewsImageContext = {
        newsId,
        title: ctxPartial.title ?? "",
        excerpt: ctxPartial.excerpt ?? "",
        homeTeamName: ctxPartial.homeTeamName,
        awayTeamName: ctxPartial.awayTeamName,
        scoreStr: ctxPartial.scoreStr,
        jornadaInfo: ctxPartial.jornadaInfo,
      };
      const result = await buildImagePromptFromBrief(brief, ctx, gameData, deepseekKey);
      if (!validatePrompt(result.prompt)) {
        console.warn(`[generateNewsImage/brief] banned_terms — usando brief directamente`);
        prompt = `Portuguese amateur basketball. ${brief.slice(0, 400)}`;
        negativePrompt = STANDARD_NEGATIVE;
      } else {
        prompt = result.prompt; negativePrompt = result.negativePrompt;
      }
      console.log(`[generateNewsImage/brief] deepseek:ok ${Date.now() - t0}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage/brief] deepseek:fail — ${msg}`);
      prompt = `Portuguese amateur basketball, Liga INATEL, sports hall. ${brief.slice(0, 400)}`;
      negativePrompt = STANDARD_NEGATIVE;
    }
  } else {
    prompt = `Portuguese amateur basketball, Liga INATEL, sports hall. ${brief.slice(0, 400)}`;
    negativePrompt = STANDARD_NEGATIVE;
  }

  await admin.from("news").update({ image_prompt: prompt }).eq("id", newsId);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const t1 = Date.now();
    try {
      const { buffer: rawBuffer, seed } = await callFalApi(prompt, negativePrompt, falKey);
      console.log(`[generateNewsImage/brief] fal:ok seed=${seed} ${Date.now() - t1}ms`);

      const ctx: NewsImageContext = {
        newsId,
        title: ctxPartial.title ?? "",
        excerpt: ctxPartial.excerpt ?? "",
        homeTeamName: ctxPartial.homeTeamName,
        awayTeamName: ctxPartial.awayTeamName,
      };
      const webpBuffer = await buildFinalImage(rawBuffer, ctx, gameData);
      const { publicUrl } = await saveImageToStorage(admin, newsId, webpBuffer);

      await admin.from("news")
        .update({ cover_image_url: publicUrl, image_status: "ready", image_seed: seed, image_error: null, image_error_type: null })
        .eq("id", newsId);

      await deletePreviousImage(admin, oldImageUrl);
      console.log(`[generateNewsImage/brief] done total=${Date.now() - tTotal}ms ${newsId}`);
      return { ok: true };
    } catch (err) {
      const errorType = (err as Partial<FalError>).errorType ?? "UNKNOWN";
      const msg = err instanceof Error ? err.message : String(err);
      if (errorType === "BILLING" || errorType === "AUTH" || errorType === "CONTENT") {
        await setImageFailed(newsId, errorType, msg);
        return { ok: false, errorType };
      }
      if (attempt === 2) { await setImageFailed(newsId, errorType, msg); return { ok: false, errorType }; }
      await new Promise((r) => setTimeout(r, errorType === "RATE_LIMIT" ? 10_000 : 5_000));
    }
  }
  return { ok: false, errorType: "UNKNOWN" };
}

// ─── Fetch game data from DB ──────────────────────────────────────────────────

async function fetchGameImageData(newsId: string, admin: SupabaseClient): Promise<GameImageData | null> {
  try {
    const { data: news } = await admin
      .from("news")
      .select("game_id, home_team_name, away_team_name")
      .eq("id", newsId)
      .single();

    if (!news?.game_id) return null;

    const [eventRes, resultRes, homeTeamRes, awayTeamRes] = await Promise.all([
      admin.from("events").select("location").eq("id", news.game_id).single(),
      admin.from("league_game_results")
        .select("home_score, away_score, jornada, volta")
        .eq("event_id", news.game_id)
        .maybeSingle(),
      news.home_team_name
        ? admin.from("league_teams")
            .select("primary_color, secondary_color, kit_description, logo_url")
            .ilike("name", news.home_team_name)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      news.away_team_name
        ? admin.from("league_teams")
            .select("primary_color, secondary_color, kit_description, logo_url")
            .ilike("name", news.away_team_name)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      location: eventRes.data?.location ?? null,
      homeScore: resultRes.data?.home_score ?? null,
      awayScore: resultRes.data?.away_score ?? null,
      jornada: resultRes.data?.jornada ?? null,
      volta: resultRes.data?.volta ?? null,
      homeKit: homeTeamRes.data ?? null,
      awayKit: awayTeamRes.data ?? null,
    };
  } catch (err) {
    console.warn(`[generateNewsImage] fetchGameImageData failed: ${(err as Error).message}`);
    return null;
  }
}

// ─── Image pipeline: resize + overlay ────────────────────────────────────────

async function buildFinalImage(
  rawBuffer: Buffer,
  ctx: NewsImageContext,
  gameData: GameImageData | null
): Promise<Buffer> {
  // 1. Resize para 1600×900 (crop se necessário para manter proporção)
  const resized = await sharp(rawBuffer)
    .resize(1600, 900, { fit: "cover", position: "centre" })
    .toBuffer();

  // 2. Construir overlay SVG com logos, nomes, resultado
  const overlayData = await buildOverlayData(ctx, gameData);
  const svgBuffer = buildOverlaySvg(overlayData);

  // 3. Compor SVG sobre a imagem e converter para webp
  try {
    return await sharp(resized)
      .composite([{ input: svgBuffer, blend: "over" }])
      .webp({ quality: 85 })
      .toBuffer();
  } catch (overlayErr) {
    // Se o overlay falhar (SVG parse error, etc.), usa só a imagem base
    console.warn(`[generateNewsImage] overlay falhou, usando imagem base: ${(overlayErr as Error).message}`);
    return await sharp(resized).webp({ quality: 85 }).toBuffer();
  }
}

async function buildOverlayData(
  ctx: NewsImageContext,
  gameData: GameImageData | null
): Promise<OverlayData> {
  const homeTeamName = ctx.homeTeamName ?? "";
  const awayTeamName = ctx.awayTeamName ?? "";

  let score: string | null = null;
  if (gameData?.homeScore != null && gameData?.awayScore != null) {
    score = `${gameData.homeScore}–${gameData.awayScore}`;
  } else if (ctx.scoreStr) {
    score = ctx.scoreStr;
  }

  let jornadaInfo: string | null = null;
  if (gameData?.jornada != null) {
    jornadaInfo = `Jornada ${gameData.jornada}${gameData.volta ? `, Volta ${gameData.volta}` : ""}`;
  } else if (ctx.jornadaInfo) {
    jornadaInfo = ctx.jornadaInfo;
  }

  // Fetch logos em paralelo (best effort — sem falhar se indisponível)
  const [homeLogoB64, awayLogoB64] = await Promise.all([
    gameData?.homeKit?.logo_url ? fetchImageAsBase64(gameData.homeKit.logo_url) : Promise.resolve(null),
    gameData?.awayKit?.logo_url ? fetchImageAsBase64(gameData.awayKit.logo_url) : Promise.resolve(null),
  ]);

  return {
    homeTeamName,
    awayTeamName,
    score,
    jornadaInfo,
    homeLogoB64,
    awayLogoB64,
    homePrimaryColor: gameData?.homeKit?.primary_color ?? "#F97316",
    awayPrimaryColor: gameData?.awayKit?.primary_color ?? "#6366F1",
  };
}

function buildOverlaySvg(d: OverlayData): Buffer {
  const W = 1600;
  const H = 900;
  const BAR_Y = 790;     // início da barra sólida
  const GRAD_Y = 620;    // início do gradiente
  const LOGO_Y = 802;    // topo dos logos
  const LOGO_W = 80;     // largura/altura dos logos
  const NAME_Y = 863;    // baseline do texto dos nomes
  const SCORE_Y = 872;   // baseline do score
  const JORNADA_Y = 893; // baseline da jornada
  const FONT = "'Noto Sans','DejaVu Sans',Arial,sans-serif";

  const truncate = (s: string, n: number) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;

  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const homeName = escXml(truncate(d.homeTeamName, 22));
  const awayName = escXml(truncate(d.awayTeamName, 22));

  // Home: logo a x=24, nome a x=116 (ou x=24 sem logo)
  const homeLogoX = 24;
  const homeNameX = d.homeLogoB64 ? 116 : 28;

  // Away: logo a x=1496, nome a x=1472 right-aligned (ou x=1572 sem logo)
  const awayLogoX = 1496;
  const awayNameX = d.awayLogoB64 ? 1472 : 1572;

  const homeLogoEl = d.homeLogoB64
    ? `<image x="${homeLogoX}" y="${LOGO_Y}" width="${LOGO_W}" height="${LOGO_W}" href="${d.homeLogoB64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${homeLogoX + LOGO_W / 2}" cy="${LOGO_Y + LOGO_W / 2}" r="${LOGO_W / 2 - 2}" fill="${escXml(d.homePrimaryColor)}" opacity="0.9"/>
       <text x="${homeLogoX + LOGO_W / 2}" y="${LOGO_Y + LOGO_W / 2 + 12}" font-family="${FONT}" font-size="30" font-weight="900" fill="white" text-anchor="middle">${escXml(d.homeTeamName.slice(0, 1))}</text>`;

  const awayLogoEl = d.awayLogoB64
    ? `<image x="${awayLogoX}" y="${LOGO_Y}" width="${LOGO_W}" height="${LOGO_W}" href="${d.awayLogoB64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${awayLogoX + LOGO_W / 2}" cy="${LOGO_Y + LOGO_W / 2}" r="${LOGO_W / 2 - 2}" fill="${escXml(d.awayPrimaryColor)}" opacity="0.9"/>
       <text x="${awayLogoX + LOGO_W / 2}" y="${LOGO_Y + LOGO_W / 2 + 12}" font-family="${FONT}" font-size="30" font-weight="900" fill="white" text-anchor="middle">${escXml(d.awayTeamName.slice(0, 1))}</text>`;

  const scoreEl = d.score
    ? `<text x="${W / 2}" y="${SCORE_Y}" font-family="${FONT}" font-size="56" font-weight="900" fill="white" text-anchor="middle">${escXml(d.score)}</text>`
    : "";

  const jornadaEl = d.jornadaInfo
    ? `<text x="${W / 2}" y="${JORNADA_Y}" font-family="${FONT}" font-size="13" fill="rgba(255,255,255,0.65)" text-anchor="middle" letter-spacing="1.2">${escXml(d.jornadaInfo.toUpperCase())}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bfade" x1="0" y1="${GRAD_Y}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.86"/>
    </linearGradient>
  </defs>

  <!-- Gradient fade -->
  <rect x="0" y="${GRAD_Y}" width="${W}" height="${H - GRAD_Y}" fill="url(#bfade)"/>

  <!-- Liga INATEL badge -->
  <rect x="${W - 238}" y="22" width="214" height="38" rx="7" fill="rgba(249,115,22,0.92)"/>
  <text x="${W - 131}" y="47" font-family="${FONT}" font-size="15" font-weight="700" fill="white" text-anchor="middle" letter-spacing="2.5">LIGA INATEL</text>

  <!-- Home team -->
  ${homeLogoEl}
  <text x="${homeNameX}" y="${NAME_Y}" font-family="${FONT}" font-size="28" font-weight="700" fill="white">${homeName}</text>

  <!-- Score -->
  ${scoreEl}

  <!-- Away team -->
  ${awayLogoEl}
  <text x="${awayNameX}" y="${NAME_Y}" font-family="${FONT}" font-size="28" font-weight="700" fill="white" text-anchor="end">${awayName}</text>

  <!-- Jornada -->
  ${jornadaEl}
</svg>`;

  return Buffer.from(svg);
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "image/png";
    const mime = ct.split(";")[0].trim();
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
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
    .upload(storagePath, buffer, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
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
    await admin.from("news").update({
      image_status: "failed",
      image_error_type: errorType,
      image_error: errorMsg.slice(0, 500),
    }).eq("id", newsId);
  } catch { /* best effort */ }
}

// ─── Negative prompt padrão ──────────────────────────────────────────────────

const STANDARD_NEGATIVE =
  "text, letters, words, numbers, jersey numbers, logos, team names, scoreboards, " +
  "NBA, NCAA, american arena, english signage, professional basketball, stadium, " +
  "watermark, brand names, readable text, banners with words, advertisements";

// ─── DeepSeek: prompt editorial a partir de dados reais ──────────────────────

function buildKitLine(teamName: string, kit: TeamKit | null): string {
  if (!kit) return `Team: ${teamName} (no kit data)`;
  const parts = [`Team: ${teamName}`];
  if (kit.kit_description) parts.push(`Kit: ${kit.kit_description}`);
  else if (kit.primary_color) parts.push(`Primary color: ${kit.primary_color}${kit.secondary_color ? `, secondary: ${kit.secondary_color}` : ""}`);
  return parts.join(" | ");
}

// System prompt fixo e rigoroso para geração editorial
function buildEditorialSystemPrompt(
  homeTeamName: string,
  awayTeamName: string,
  homeKit: TeamKit | null,
  awayKit: TeamKit | null,
  location: string | null
): string {
  return `You are generating a Flux AI image prompt for a Portuguese amateur basketball news photo.

MANDATORY CONTEXT — do not deviate:
- League: Liga INATEL (amateur/masters basketball, Porto region, Portugal)
- Setting: ${location ? `"${location}" — ` : ""}Portuguese municipal or school sports hall with small bleachers (50–200 seats), wooden or synthetic parquet floor, fluorescent tube ceiling lighting, walls with Portuguese signage only
- Players: adult amateur males aged 35–60, regular build, NOT professional or semi-professional athletes
- Photography style: photorealistic sports photo, telephoto lens, shallow depth of field, motion blur, no 3D-render appearance

TEAMS PLAYING TODAY:
${buildKitLine(homeTeamName, homeKit)}
${buildKitLine(awayTeamName, awayKit)}

STRICT PROHIBITIONS (any violation → your response is rejected):
- NEVER write team names, jersey numbers, logos or text in the image description
- NEVER reference NBA, NCAA, American basketball, famous players or professional leagues
- NEVER invent sponsors, city names not provided, or league names other than Liga INATEL
- Players must NOT have recognizable faces — behind, motion-blurred, or silhouette only
- NO scoreboards, banners, advertising boards with readable text

REQUIRED: describe players' jerseys ONLY using the colors above; no other color schemes.

Respond with valid JSON only (no markdown):
{"prompt": "...", "negative_prompt": "..."}
prompt: 80–200 words, English, specific, photorealistic sports documentary photography
negative_prompt: 20–50 words (always include: text, letters, numbers, NBA, american arena, english signage)`;
}

async function buildImagePrompt(
  ctx: NewsImageContext,
  gameData: GameImageData | null,
  apiKey: string
): Promise<{ prompt: string; negativePrompt: string }> {
  const homeTeamName = ctx.homeTeamName ?? "";
  const awayTeamName = ctx.awayTeamName ?? "";

  const systemPrompt = buildEditorialSystemPrompt(
    homeTeamName, awayTeamName,
    gameData?.homeKit ?? null, gameData?.awayKit ?? null,
    gameData?.location ?? null
  );

  const score = gameData?.homeScore != null ? `${gameData.homeScore}–${gameData.awayScore}` : ctx.scoreStr ?? "";
  const jornada = gameData?.jornada != null
    ? `Jornada ${gameData.jornada}${gameData.volta ? `, Volta ${gameData.volta}` : ""}`
    : ctx.jornadaInfo ?? "";

  const userContent = [
    `Game: ${homeTeamName} ${score} ${awayTeamName}`,
    jornada && `Round: ${jornada}`,
    gameData?.location && `Venue: ${gameData.location}`,
    `Article title: ${ctx.title}`,
    ctx.excerpt && `Lead: ${ctx.excerpt.slice(0, 120)}`,
  ].filter(Boolean).join("\n");

  return callDeepSeekForPrompt(systemPrompt, userContent, apiKey);
}

// ─── DeepSeek: brief criativo do admin ───────────────────────────────────────

const BRIEF_SYSTEM_PROMPT = `You are a creative director translating a human brief into a Flux AI image prompt.

The brief may be in any language. The image is for a Liga INATEL basketball news article.

Rules:
1. Translate the brief's intent into a vivid, specific English image prompt for Flux.
2. Respect the STYLE the brief requests:
   - photorealistic/editorial/photograph → cinematic sports photography
   - poster/cartaz/illustration/não-realista/design/graphic → graphic design, flat art, poster
   - specific style (retro, watercolor, 3D render) → follow exactly
   - no style specified → editorial sports photography
3. Incorporate article context (teams, location) to add specificity.
4. Always prohibit text, logos, faces in negative_prompt.

Respond with valid JSON only (no markdown):
{"prompt": "...", "negative_prompt": "..."}
prompt: 80–200 words, English only, specific and visual
negative_prompt: 20–50 words`;

async function buildImagePromptFromBrief(
  brief: string,
  ctx: NewsImageContext,
  gameData: GameImageData | null,
  apiKey: string
): Promise<{ prompt: string; negativePrompt: string }> {
  const userContent = [
    `Creative brief: ${brief}`,
    ctx.title && `Article title: ${ctx.title}`,
    ctx.homeTeamName && `Home team: ${ctx.homeTeamName}`,
    ctx.awayTeamName && `Away team: ${ctx.awayTeamName}`,
    gameData?.location && `Venue: ${gameData.location}`,
    gameData?.homeKit?.kit_description && `Home kit: ${gameData.homeKit.kit_description}`,
    gameData?.awayKit?.kit_description && `Away kit: ${gameData.awayKit.kit_description}`,
  ].filter(Boolean).join("\n");

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
    choices?: { finish_reason?: string; message?: { content?: string; reasoning_content?: string } }[];
  };

  const choice = json.choices?.[0];
  const finishReason = choice?.finish_reason ?? "unknown";
  const raw = choice?.message?.content ?? "";

  if (!raw.trim()) {
    const hint = choice?.message?.reasoning_content?.slice(0, 200) ?? "";
    throw new Error(`DeepSeek devolveu conteúdo vazio (finish_reason=${finishReason}${hint ? `, reasoning="${hint}"` : ""})`);
  }

  const parsed = safeParseJson(raw);

  if (!parsed?.prompt || parsed.prompt.length < 30) {
    if (raw.length > 50) {
      console.warn(`[generateNewsImage] deepseek não-JSON, usando como prompt directo (${raw.length} chars)`);
      return { prompt: raw.slice(0, 500), negativePrompt: STANDARD_NEGATIVE };
    }
    throw new Error(`DeepSeek prompt inválido (finish_reason=${finishReason}): ${raw.slice(0, 300)}`);
  }

  return {
    prompt: parsed.prompt.slice(0, 500),
    negativePrompt: (parsed.negative_prompt ?? STANDARD_NEGATIVE).slice(0, 300),
  };
}

function safeParseJson(raw: string): { prompt?: string; negative_prompt?: string } | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as { prompt?: string; negative_prompt?: string }; }
  catch (err) { console.error(`[safeParseJson] falhou:`, (err as Error).message); return null; }
}

// Fallback determinístico com dados reais quando DeepSeek falha
function buildFallbackPrompt(
  ctx: NewsImageContext,
  gameData: GameImageData | null
): { prompt: string; negativePrompt: string } {
  const home = ctx.homeTeamName ?? "";
  const away = ctx.awayTeamName ?? "";
  const homeColor = gameData?.homeKit?.kit_description ?? gameData?.homeKit?.primary_color ?? "colored";
  const awayColor = gameData?.awayKit?.kit_description ?? gameData?.awayKit?.primary_color ?? "contrasting";
  const venue = gameData?.location ?? "Portuguese municipal sports hall";
  const score = gameData?.homeScore != null ? `${gameData.homeScore}–${gameData.awayScore}` : ctx.scoreStr ?? "";

  const fragments = [
    "Photorealistic sports documentary photograph of an amateur basketball game in Portugal.",
    `Indoor sports hall: ${venue}. Small bleachers, parquet floor, fluorescent overhead lighting.`,
    `Two teams of adult amateur men (35-60 years old). Home team in ${homeColor} jerseys. Away team in ${awayColor} jerseys.`,
    "Dynamic moment: player driving to the basket, ball in play, defenders in motion, arms outstretched.",
    score && `Final score context: ${home} ${score} ${away}.`,
    "Telephoto lens, shallow depth of field, motion blur on hands and ball. No faces visible — players from behind or in silhouette.",
  ].filter(Boolean);

  return {
    prompt: fragments.join(" ").slice(0, 500),
    negativePrompt: STANDARD_NEGATIVE,
  };
}

// ─── fal.ai ───────────────────────────────────────────────────────────────────

async function callFalApi(
  prompt: string,
  negativePrompt: string | undefined,
  falKey: string
): Promise<{ buffer: Buffer; seed: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000); // flux/dev é mais lento
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
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: false,
        seed,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      const errorType = classifyFalError(res.status, errText);
      throw Object.assign(new Error(`fal.ai HTTP ${res.status}: ${errText.slice(0, 300)}`), { errorType }) as FalError;
    }

    const json = (await res.json()) as { images?: { url: string }[] };
    const imageUrl = json.images?.[0]?.url;
    if (!imageUrl) throw new Error("fal.ai: resposta sem URL de imagem");

    const imgRes = await fetch(imageUrl, { signal: controller.signal });
    if (!imgRes.ok) throw new Error(`fal.ai download falhou: HTTP ${imgRes.status}`);

    return { buffer: Buffer.from(await imgRes.arrayBuffer()), seed };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw Object.assign(new Error("fal.ai timeout (120s)"), { errorType: "TRANSIENT" as FalErrorType }) as FalError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
