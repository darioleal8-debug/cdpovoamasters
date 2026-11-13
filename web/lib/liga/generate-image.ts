import fs from "fs";
import path from "path";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { deepseekJSON } from "@/lib/deepseek";
import { isDocumentNotPhoto } from "@/lib/match-docs/classify";

// ─── Font loading (Inter Bold WOFF — embutida no SVG para librsvg no Vercel) ─
let _fontB64: string | null | undefined;
function getInterBoldB64(): string | null {
  if (_fontB64 !== undefined) return _fontB64;
  try {
    const p = path.join(process.cwd(), "public", "fonts", "inter-bold.woff");
    _fontB64 = fs.readFileSync(p).toString("base64");
    console.log(`[font] Inter Bold WOFF carregado: ${_fontB64.length} chars`);
  } catch (err) {
    console.warn(`[font] Inter Bold não encontrado: ${(err as Error).message} — usando sans-serif`);
    _fontB64 = null;
  }
  return _fontB64;
}

// flux/dev: modelo fotorrealista (28 steps), muito mais qualidade que schnell (4 steps)
const FAL_API = "https://fal.run/fal-ai/flux/dev";
const BUCKET = "noticias";

// Placard sobreposto desativado: a imagem da notícia é só a foto do jogo.
const ENABLE_SCOREBOARD_OVERLAY = false;

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

interface GamePeriod {
  period: number;
  home: number;
  away: number;
}

interface GameImageData {
  location: string | null;
  eventDate: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  jornada: number | null;
  volta: number | null;
  periods: GamePeriod[] | null;
  homeKit: TeamKit | null;
  awayKit: TeamKit | null;
}

interface OverlayData {
  homeTeamName: string;
  awayTeamName: string;
  score: string | null;
  homeScore: number | null;
  awayScore: number | null;
  jornadaInfo: string | null;
  eventDate: string | null;
  periods: GamePeriod[] | null;
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

  const admin = await createUnscopedAdminClient();
  const tTotal = Date.now();

  // Buscar URL anterior e dados do jogo em paralelo
  const [newsRow, gameData] = await Promise.all([
    admin.from("news").select("cover_image_url, game_id").eq("id", ctx.newsId).single(),
    fetchGameImageData(ctx.newsId, admin),
  ]);
  const oldImageUrl = newsRow.data?.cover_image_url ?? null;

  // ── Passo 0: se existem fotos reais do jogo, usar a primeira como capa ────
  const gameId = newsRow.data?.game_id;
  if (gameId) {
    try {
      const realPic = await pickRealCoverPhoto(admin, gameId);
      const gamePics = realPic ? [realPic] : [];

      if (gamePics && gamePics.length > 0) {
        // Foto real: usar URL pública directamente — sem download, sem compressão
        const { data: pub } = admin.storage.from("game-photos").getPublicUrl(gamePics[0].storage_path);
        await admin.from("news").update({
          cover_image_url: pub.publicUrl,
          cover_photo_id: gamePics[0].id,
          image_source: "upload",
          image_status: "ready",
          image_error: null,
          image_error_type: null,
          image_prompt: null,
        }).eq("id", ctx.newsId);
        await deletePreviousImage(admin, oldImageUrl);
        console.log(`[generateNewsImage] real photo (direct URL) total=${Date.now() - tTotal}ms`);
        return { ok: true };
      }
    } catch (photoErr) {
      console.warn(`[generateNewsImage] real photo check failed: ${(photoErr as Error).message} — continuing to fal.ai`);
    }
  }

  // ── Passo 1: gerar prompt com dados reais ─────────────────────────────────
  let prompt: string;
  let negativePrompt: string;

  if (deepseekKey) {
    const t0 = Date.now();
    console.log(`[generateNewsImage] deepseek:start ${ctx.newsId} model=${process.env.DEEPSEEK_TEXT_MODEL ?? "deepseek-chat"}`);
    try {
      const result = await buildImagePrompt(ctx, gameData);
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
        .update({ cover_image_url: publicUrl, image_source: "ai", image_status: "ready", image_seed: seed, image_error: null, image_error_type: null })
        .eq("id", ctx.newsId);

      if (updateErr) throw new Error(`DB update: ${updateErr.message}`);

      await deletePreviousImage(admin, oldImageUrl);
      console.log(`[generateNewsImage] done total=${Date.now() - tTotal}ms ${ctx.newsId}`);
      return { ok: true };
    } catch (err) {
      const errorType = (err as Partial<FalError>).errorType ?? "UNKNOWN";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[generateNewsImage] fail attempt=${attempt} type=${errorType} ${Date.now() - t1}ms — ${msg}`);

      if (errorType === "BILLING" || errorType === "AUTH" || errorType === "CONTENT" || attempt === 2) {
        return await scoreboardFallback(ctx, oldImageUrl, { type: errorType, msg });
      }
      const delay = errorType === "RATE_LIMIT" ? 10_000 : 5_000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return await scoreboardFallback(ctx, oldImageUrl, { type: "UNKNOWN", msg: "geração falhou" });
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

  const admin = await createUnscopedAdminClient();
  const tTotal = Date.now();

  const [newsRow, gameData] = await Promise.all([
    admin.from("news").select("cover_image_url, game_id").eq("id", newsId).single(),
    fetchGameImageData(newsId, admin),
  ]);
  const oldImageUrl = newsRow.data?.cover_image_url ?? null;

  // ── Passo 0: se existem fotos reais do jogo, usar a primeira como capa ────
  const gameIdBrief = newsRow.data?.game_id;
  if (gameIdBrief) {
    try {
      const realPic = await pickRealCoverPhoto(admin, gameIdBrief);
      const gamePics = realPic ? [realPic] : [];
      if (gamePics && gamePics.length > 0) {
        const { data: pub } = admin.storage.from("game-photos").getPublicUrl(gamePics[0].storage_path);
        await admin.from("news").update({
          cover_image_url: pub.publicUrl,
          cover_photo_id: gamePics[0].id,
          image_source: "upload",
          image_status: "ready",
          image_error: null,
          image_error_type: null,
          image_prompt: null,
        }).eq("id", newsId);
        await deletePreviousImage(admin, oldImageUrl);
        console.log(`[generateNewsImage/brief] real photo (direct URL) total=${Date.now() - tTotal}ms`);
        return { ok: true };
      }
    } catch (photoErr) {
      console.warn(`[generateNewsImage/brief] real photo check failed: ${(photoErr as Error).message} — continuing`);
    }
  }

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
      const result = await buildImagePromptFromBrief(brief, ctx, gameData);
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
        .update({ cover_image_url: publicUrl, image_source: "ai", image_status: "ready", image_seed: seed, image_error: null, image_error_type: null })
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

    const [eventRes, resultRes, homeTeamRes, awayTeamRes, sheetRes] = await Promise.all([
      admin.from("events").select("location, event_date").eq("id", news.game_id).single(),
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
      admin.from("game_sheet_imports")
        .select("sheet_data")
        .eq("event_id", news.game_id)
        .eq("status", "published")
        .order("confirmed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Extrair parciais do boletim confirmado (se existir)
    const sheetData = sheetRes.data?.sheet_data as { periods?: unknown[] } | null;
    const rawPeriods = Array.isArray(sheetData?.periods) ? sheetData!.periods : null;
    const periods: GamePeriod[] | null = rawPeriods
      ? (rawPeriods as GamePeriod[]).filter(
          (p) => typeof p?.period === "number" && typeof p?.home === "number" && typeof p?.away === "number"
        )
      : null;

    return {
      location: eventRes.data?.location ?? null,
      eventDate: (eventRes.data?.event_date as string | null) ?? null,
      homeTeamName: (news.home_team_name as string | null) ?? null,
      awayTeamName: (news.away_team_name as string | null) ?? null,
      homeScore: resultRes.data?.home_score ?? null,
      awayScore: resultRes.data?.away_score ?? null,
      jornada: resultRes.data?.jornada ?? null,
      volta: resultRes.data?.volta ?? null,
      periods: periods?.length ? periods : null,
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
  // Imagem limpa: só a fotografia do jogo, sem placard/overlay
  if (!ENABLE_SCOREBOARD_OVERLAY) {
    return await sharp(rawBuffer)
      .resize(1600, 900, { fit: "cover", position: "attention" })
      .webp({ quality: 88 })
      .toBuffer();
  }

  // 1. Resize + blur ligeiro (1.5σ) para foco no scoreboard sem destruir o fundo
  const resized = await sharp(rawBuffer)
    .resize(1600, 900, { fit: "cover", position: "centre" })
    .blur(1.5)
    .toBuffer();
  const meta = await sharp(resized).metadata();
  console.log(`[buildFinalImage] resized ${meta.width}x${meta.height}`);

  // 2. Construir overlay SVG com logos, nomes, resultado
  const overlayData = await buildOverlayData(ctx, gameData);
  const svgBuffer = buildOverlaySvg(overlayData);

  // 3. Compor SVG sobre a imagem e converter para webp
  console.log(`[buildFinalImage] svgBuffer size=${svgBuffer.length} bytes`);
  try {
    const result = await sharp(resized)
      .composite([{ input: svgBuffer, blend: "over" }])
      .webp({ quality: 85 })
      .toBuffer();
    console.log(`[buildFinalImage] composite ok outputSize=${result.length} bytes`);
    return result;
  } catch (overlayErr) {
    console.error(`[buildFinalImage] overlay falhou — usando imagem base: ${(overlayErr as Error).message}`);
    return await sharp(resized).webp({ quality: 85 }).toBuffer();
  }
}

async function buildOverlayData(
  ctx: NewsImageContext,
  gameData: GameImageData | null
): Promise<OverlayData> {
  // Fallback: se o caller não passar nomes, usar o que está na BD via gameData
  const homeTeamName = (ctx.homeTeamName || gameData?.homeTeamName || "").trim();
  const awayTeamName = (ctx.awayTeamName || gameData?.awayTeamName || "").trim();
  console.log(`[overlay] home="${homeTeamName}" away="${awayTeamName}" homeScore=${gameData?.homeScore ?? "null"} awayScore=${gameData?.awayScore ?? "null"}`);

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
  console.log(`[overlay] homeLogo=${homeLogoB64 ? "ok" : "null"} awayLogo=${awayLogoB64 ? "ok" : "null"} homeLogoUrl=${gameData?.homeKit?.logo_url ?? "null"}`);

  return {
    homeTeamName,
    awayTeamName,
    score,
    homeScore: gameData?.homeScore ?? null,
    awayScore: gameData?.awayScore ?? null,
    jornadaInfo,
    eventDate: gameData?.eventDate ?? null,
    periods: gameData?.periods ?? null,
    homeLogoB64,
    awayLogoB64,
    homePrimaryColor: gameData?.homeKit?.primary_color ?? "#F97316",
    awayPrimaryColor: gameData?.awayKit?.primary_color ?? "#6366F1",
  };
}

function buildOverlaySvg(d: OverlayData): Buffer {
  const W = 1600;
  const H = 900;

  const GOLD = "#C8A852";
  const NAVY = "#0B1626";

  // Panel geometry — layout de duas linhas (casa / fora)
  const PX = 80, PY = 185, PW = 1440;
  const HEADER_H = 52;
  const ROW_H = 213;
  const SEP_H = 2;
  const FOOTER_H = 50;
  const PH = HEADER_H + ROW_H + SEP_H + ROW_H + FOOTER_H; // 530

  const PANEL_CX = PX + PW / 2; // 800

  const CONTENT_TOP = PY + HEADER_H;      // 237
  const HOME_ROW_TOP = CONTENT_TOP;        // 237
  const SEP_Y = HOME_ROW_TOP + ROW_H;     // 450
  const AWAY_ROW_TOP = SEP_Y + SEP_H;     // 452
  const FOOTER_TOP = AWAY_ROW_TOP + ROW_H; // 665
  const FOOTER_MID_Y = FOOTER_TOP + Math.round(FOOTER_H / 2) + 8; // 698

  // Logo — alinhado à esquerda, centrado verticalmente na linha
  const LOGO_SZ = 110;
  const LOGO_X = 115;
  const LOGO_CX = LOGO_X + LOGO_SZ / 2; // 170
  const HOME_LOGO_Y = HOME_ROW_TOP + Math.round((ROW_H - LOGO_SZ) / 2); // 288
  const HOME_LOGO_CY = HOME_LOGO_Y + LOGO_SZ / 2; // 343
  const AWAY_LOGO_Y = AWAY_ROW_TOP + Math.round((ROW_H - LOGO_SZ) / 2); // 503
  const AWAY_LOGO_CY = AWAY_LOGO_Y + LOGO_SZ / 2; // 558

  // Nome — à direita do logo, centrado verticalmente
  const NAME_X = LOGO_X + LOGO_SZ + 20; // 245
  const HOME_NAME_Y = HOME_ROW_TOP + Math.round(ROW_H * 0.5) + 14; // ~359
  const AWAY_NAME_Y = AWAY_ROW_TOP + Math.round(ROW_H * 0.5) + 14; // ~574

  // Marcador — alinhado à direita do painel
  const SCORE_X = PX + PW - 20; // 1500
  const HOME_SCORE_Y = HOME_ROW_TOP + Math.round(ROW_H * 0.62) + 18; // ~385
  const AWAY_SCORE_Y = AWAY_ROW_TOP + Math.round(ROW_H * 0.62) + 18; // ~600

  const hasResult = d.homeScore != null && d.awayScore != null;
  const statusLabel = hasResult ? "RESULTADO FINAL" : "PRÓXIMO JOGO";
  const statusBadgeW = hasResult ? 196 : 168;

  const homeWins = hasResult && d.homeScore! > d.awayScore!;
  const awayWins = hasResult && d.awayScore! > d.homeScore!;
  const homeScoreColor = homeWins ? GOLD : "white";
  const awayScoreColor = awayWins ? GOLD : "white";

  const truncate = (s: string, n: number) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;

  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const homeName = escXml(truncate(d.homeTeamName, 26));
  const awayName = escXml(truncate(d.awayTeamName, 26));

  // Font — Inter Bold embutida para garantir renderização no Lambda da Vercel
  const fontB64 = getInterBoldB64();
  const FONT = fontB64 ? "'Inter', sans-serif" : "sans-serif";
  const fontStyleEl = fontB64
    ? `<style>@font-face { font-family: 'Inter'; src: url('data:font/woff;base64,${fontB64}'); font-weight: 700; font-style: normal; }</style>`
    : "";

  // xlink:href mantém compatibilidade com librsvg <2.52; href é para SVG2/librsvg >=2.52
  const homeLogoEl = d.homeLogoB64
    ? `<image x="${LOGO_X}" y="${HOME_LOGO_Y}" width="${LOGO_SZ}" height="${LOGO_SZ}" xlink:href="${d.homeLogoB64}" href="${d.homeLogoB64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${LOGO_CX}" cy="${HOME_LOGO_CY}" r="${LOGO_SZ / 2 - 3}" fill="${escXml(d.homePrimaryColor)}" opacity="0.85"/>
       <text x="${LOGO_CX}" y="${HOME_LOGO_CY + 14}" font-family="${FONT}" font-size="38" font-weight="900" fill="white" text-anchor="middle">${escXml(d.homeTeamName.slice(0, 1))}</text>`;

  const awayLogoEl = d.awayLogoB64
    ? `<image x="${LOGO_X}" y="${AWAY_LOGO_Y}" width="${LOGO_SZ}" height="${LOGO_SZ}" xlink:href="${d.awayLogoB64}" href="${d.awayLogoB64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${LOGO_CX}" cy="${AWAY_LOGO_CY}" r="${LOGO_SZ / 2 - 3}" fill="${escXml(d.awayPrimaryColor)}" opacity="0.85"/>
       <text x="${LOGO_CX}" y="${AWAY_LOGO_CY + 14}" font-family="${FONT}" font-size="38" font-weight="900" fill="white" text-anchor="middle">${escXml(d.awayTeamName.slice(0, 1))}</text>`;

  const homeScoreEl = hasResult
    ? `<text x="${SCORE_X}" y="${HOME_SCORE_Y}" font-family="${FONT}" font-size="90" font-weight="900" fill="${homeScoreColor}" text-anchor="end">${d.homeScore}</text>`
    : "";

  const awayScoreEl = hasResult
    ? `<text x="${SCORE_X}" y="${AWAY_SCORE_Y}" font-family="${FONT}" font-size="90" font-weight="900" fill="${awayScoreColor}" text-anchor="end">${d.awayScore}</text>`
    : "";

  // Rodapé: linha 1 = jornada (ou data), linha 2 = parciais (se disponíveis)
  const FOOTER_LINE1_Y = FOOTER_TOP + 18;
  const FOOTER_LINE2_Y = FOOTER_TOP + 38;

  const periodsStr = d.periods?.length
    ? d.periods.map((p) => `P${p.period}: ${p.home}-${p.away}`).join("  ·  ")
    : null;

  const dateStr = d.eventDate
    ? (() => {
        try {
          return new Date(d.eventDate).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
        } catch { return null; }
      })()
    : null;

  const footerLine1 = [d.jornadaInfo?.toUpperCase(), dateStr].filter(Boolean).join("  ·  ");

  const jornadaEl = [
    footerLine1
      ? `<text x="${PANEL_CX}" y="${FOOTER_LINE1_Y}" font-family="${FONT}" font-size="12" font-weight="600" fill="${GOLD}" text-anchor="middle" letter-spacing="2.0" opacity="0.82">${escXml(footerLine1)}</text>`
      : "",
    periodsStr
      ? `<text x="${PANEL_CX}" y="${FOOTER_LINE2_Y}" font-family="${FONT}" font-size="11" font-weight="600" fill="white" text-anchor="middle" letter-spacing="1.5" opacity="0.65">${escXml(periodsStr)}</text>`
      : "",
  ].join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  ${fontStyleEl}
  <defs>
    <clipPath id="panelClip">
      <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6"/>
    </clipPath>
    <filter id="panelGlow" x="-6%" y="-6%" width="112%" height="112%">
      <feDropShadow dx="0" dy="6" stdDeviation="18" flood-color="#000" flood-opacity="0.60"/>
    </filter>
    <linearGradient id="goldShine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${GOLD}" stop-opacity="0"/>
      <stop offset="25%"  stop-color="${GOLD}" stop-opacity="0.7"/>
      <stop offset="75%"  stop-color="${GOLD}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="navyFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${NAVY}" stop-opacity="0.0"/>
      <stop offset="100%" stop-color="${NAVY}" stop-opacity="0.35"/>
    </linearGradient>
  </defs>

  <!-- Overlay ligeiro sobre a foto -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="${NAVY}" opacity="0.22"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#navyFade)"/>

  <!-- Panel shadow -->
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="#000" opacity="0.35" filter="url(#panelGlow)"/>

  <!-- Panel background -->
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="${NAVY}" opacity="0.93"/>

  <!-- Header strip -->
  <rect x="${PX}" y="${PY}" width="${PW}" height="${HEADER_H}" clip-path="url(#panelClip)" fill="${GOLD}" opacity="0.09"/>

  <!-- Gold shimmer no topo do painel -->
  <rect x="${PX + 2}" y="${PY + 2}" width="${PW - 4}" height="2" fill="url(#goldShine)"/>

  <!-- Gold border -->
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.88"/>

  <!-- Separador: header / linha casa -->
  <line x1="${PX + 24}" y1="${CONTENT_TOP}" x2="${PX + PW - 24}" y2="${CONTENT_TOP}" stroke="${GOLD}" stroke-width="1" opacity="0.40"/>

  <!-- Separador central: linha casa / linha fora -->
  <rect x="${PX + 24}" y="${SEP_Y}" width="${PW - 48}" height="${SEP_H}" fill="${GOLD}" opacity="0.30"/>

  <!-- Separador: linha fora / rodapé -->
  <line x1="${PX + 24}" y1="${FOOTER_TOP}" x2="${PX + PW - 24}" y2="${FOOTER_TOP}" stroke="${GOLD}" stroke-width="1" opacity="0.40"/>

  <!-- HEADER: Liga INATEL badge (esquerda) -->
  <rect x="${PX + 16}" y="${PY + 11}" width="130" height="30" rx="3" fill="${GOLD}" opacity="0.14"/>
  <rect x="${PX + 16}" y="${PY + 11}" width="130" height="30" rx="3" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.72"/>
  <text x="${PX + 81}" y="${PY + 31}" font-family="${FONT}" font-size="11" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="2.5">LIGA INATEL</text>

  <!-- HEADER: Status badge (centro) -->
  <rect x="${PANEL_CX - statusBadgeW / 2}" y="${PY + 11}" width="${statusBadgeW}" height="30" rx="3" fill="${GOLD}" opacity="0.14"/>
  <rect x="${PANEL_CX - statusBadgeW / 2}" y="${PY + 11}" width="${statusBadgeW}" height="30" rx="3" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.85"/>
  <text x="${PANEL_CX}" y="${PY + 31}" font-family="${FONT}" font-size="11" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="2.5">${escXml(statusLabel)}</text>

  <!-- HEADER: Modalidade badge (direita) -->
  <rect x="${PX + PW - 16 - 224}" y="${PY + 11}" width="224" height="30" rx="3" fill="${GOLD}" opacity="0.14"/>
  <rect x="${PX + PW - 16 - 224}" y="${PY + 11}" width="224" height="30" rx="3" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.72"/>
  <text x="${PX + PW - 16 - 112}" y="${PY + 31}" font-family="${FONT}" font-size="11" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="2.0">BASQUETEBOL VETERANOS</text>

  <!-- LINHA CASA: logo -->
  ${homeLogoEl}
  <!-- LINHA CASA: nome -->
  <text x="${NAME_X}" y="${HOME_NAME_Y}" font-family="${FONT}" font-size="36" font-weight="700" fill="white">${homeName}</text>
  <!-- LINHA CASA: marcador -->
  ${homeScoreEl}

  <!-- LINHA FORA: logo -->
  ${awayLogoEl}
  <!-- LINHA FORA: nome -->
  <text x="${NAME_X}" y="${AWAY_NAME_Y}" font-family="${FONT}" font-size="36" font-weight="700" fill="white">${awayName}</text>
  <!-- LINHA FORA: marcador -->
  ${awayScoreEl}

  <!-- RODAPÉ: jornada -->
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

// ─── Seleção da foto de capa: só fotografias reais do jogo ────────────────────

/**
 * Primeira fotografia visível do jogo que não seja um documento (captura de estatísticas, folha, tabela).
 * Documentos detetados são ocultados da galeria (o admin pode voltar a mostrá-los). Se a deteção
 * falhar tecnicamente, a foto é aceite — nunca se perde uma foto real por falha da API.
 */
async function pickRealCoverPhoto(admin: SupabaseClient, gameId: string): Promise<{ id: string; storage_path: string } | null> {
  const { data: pics } = await admin
    .from("game_photos")
    .select("id, storage_path")
    .eq("game_id", gameId)
    .eq("hidden", false)
    .order("created_at", { ascending: true })
    .limit(6);
  for (const pic of pics ?? []) {
    try {
      const { data: blob } = await admin.storage.from("game-photos").download(pic.storage_path as string);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        const mime = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
        if ((await isDocumentNotPhoto(buf, mime)) === true) {
          console.warn(`[generateNewsImage] foto ${pic.id} é um documento, não uma foto de jogo — ocultada e ignorada como capa`);
          await admin.from("game_photos").update({ hidden: true }).eq("id", pic.id);
          continue;
        }
      }
    } catch (e) {
      console.warn(`[generateNewsImage] verificação da foto ${pic.id} falhou: ${(e as Error).message} — aceite`);
    }
    return { id: pic.id as string, storage_path: pic.storage_path as string };
  }
  return null;
}

// ─── Último recurso: scoreboard com o resultado final ─────────────────────────

/** Scoreboard (fundo liso + placard com equipas e resultado final) quando não há foto nem imagem IA. */
async function scoreboardFallback(ctx: NewsImageContext, oldImageUrl: string | null, failure: { type: FalErrorType; msg: string }): Promise<GenerateResult> {
  try {
    const admin = await createUnscopedAdminClient();
    const gameData = await fetchGameImageData(ctx.newsId, admin);
    const hasScore = (gameData?.homeScore != null && gameData?.awayScore != null) || !!ctx.scoreStr;
    if (!hasScore) throw new Error("sem resultado final para o scoreboard");
    const base = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#0B1626" } }).png().toBuffer();
    const svg = buildOverlaySvg(await buildOverlayData(ctx, gameData));
    const webp = await sharp(base).composite([{ input: svg, blend: "over" }]).webp({ quality: 88 }).toBuffer();
    const { publicUrl } = await saveImageToStorage(admin, ctx.newsId, webp);
    const { error } = await admin.from("news").update({
      cover_image_url: publicUrl, image_source: "fallback", image_status: "ready",
      image_error: null, image_error_type: null,
    }).eq("id", ctx.newsId);
    if (error) throw new Error(error.message);
    await deletePreviousImage(admin, oldImageUrl);
    console.info(`[generateNewsImage] scoreboard com resultado final usado (IA falhou: ${failure.type}) ${ctx.newsId}`);
    return { ok: true };
  } catch (e) {
    console.error(`[generateNewsImage] scoreboard fallback falhou: ${(e as Error).message}`);
    await setImageFailed(ctx.newsId, failure.type, failure.msg);
    return { ok: false, errorType: failure.type };
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function setImageFailed(newsId: string, errorType: FalErrorType, errorMsg: string) {
  try {
    const admin = await createUnscopedAdminClient();
    await admin.from("news").update({
      image_status: "failed",
      image_error_type: errorType,
      image_error: errorMsg.slice(0, 500),
    }).eq("id", newsId);
  } catch { /* best effort */ }
}

// ─── Negative prompt padrão ──────────────────────────────────────────────────

const STANDARD_NEGATIVE =
  "text, letters, words, numbers, jersey numbers, logos, team names, scoreboard, score display, " +
  "NBA, NCAA, american arena, english signage, professional stadium, crowd of thousands, " +
  "watermark, brand names, readable text, advertisements, " +
  "extra limbs, extra fingers, deformed hands, two balls, distorted faces, plastic skin, " +
  "3D render, cartoon, illustration, CGI, oversaturated, empty court, static posed group photo";

// ─── Cores: hex → nome em inglês (o Flux não percebe "#F97316") ───────────────

const NAMED_COLORS: [string, [number, number, number]][] = [
  ["white", [245, 245, 245]], ["black", [20, 20, 20]], ["grey", [128, 128, 128]],
  ["red", [200, 30, 30]], ["dark red / maroon", [120, 20, 30]], ["orange", [245, 120, 20]],
  ["yellow", [240, 210, 30]], ["gold", [200, 160, 60]], ["green", [30, 150, 60]],
  ["dark green", [20, 80, 40]], ["light blue / sky blue", [100, 170, 230]],
  ["royal blue", [30, 70, 200]], ["navy blue", [15, 30, 80]], ["purple", [110, 50, 160]],
  ["pink", [230, 100, 160]], ["brown", [110, 70, 40]],
];

function colorName(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = NAMED_COLORS[0][0], bestD = Infinity;
  for (const [name, c] of NAMED_COLORS) {
    const d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

function kitPhrase(kit: TeamKit | null, fallback: string): string {
  if (kit?.kit_description) return kit.kit_description;
  const p = colorName(kit?.primary_color);
  const s = colorName(kit?.secondary_color);
  if (p && s && p !== s) return `${p} jerseys with ${s} trim`;
  if (p) return `${p} jerseys`;
  return fallback;
}

// ─── DeepSeek: prompt editorial a partir de dados reais ──────────────────────

function buildKitLine(teamName: string, kit: TeamKit | null): string {
  return `${teamName}: ${kitPhrase(kit, "no kit data — choose a plain solid colour")}`;
}

// System prompt: foto de AÇÃO de um jogo de basquetebol amador
function buildEditorialSystemPrompt(
  homeTeamName: string,
  awayTeamName: string,
  homeKit: TeamKit | null,
  awayKit: TeamKit | null,
  location: string | null
): string {
  return `You write prompts for the Flux image model. Output ONE photorealistic action photo of a basketball game in progress, for a news article about an amateur veterans game in Portugal (Liga INATEL).

THE PICTURE MUST SHOW A BASKETBALL GAME — players actively competing for the ball, never an empty court, a scoreboard, a poster or a posed group.

Build the prompt in this order:
1. Shot type + moment: pick ONE peak-action moment that fits the article (layup in traffic, jump shot over a defender, rebound fight under the rim, fast break, block attempt, drive past a defender). Name the camera position (courtside low angle / baseline behind the basket / elevated from bleachers).
2. Players: 3–6 adult amateur men aged 35–55, ordinary athletic builds, some grey hair, sweat, real effort. One team in the HOME kit, the other in the AWAY kit (below) — both kits clearly visible and distinct. Plain jerseys and shorts, no numbers, no lettering.
3. Ball + hoop: exactly one orange basketball, clearly in the air or in hand; the orange hoop with white net visible in frame.
4. Venue: ${location ? `"${location}", a ` : "a "}Portuguese municipal sports hall — light wooden parquet with painted court lines, a few rows of bleachers with a small crowd, tiled or painted walls, high ceiling with industrial lights.
5. Camera + light: Canon EOS R3, 70–200mm f/2.8, 1/1000s freezing the action, shallow depth of field, background softly blurred, natural gym lighting, slight grain, editorial newspaper sports photography.

KITS:
HOME — ${buildKitLine(homeTeamName, homeKit)}
AWAY — ${buildKitLine(awayTeamName, awayKit)}

RULES:
- Describe kits by COLOUR only. Never write team names, numbers, logos, sponsors or any text into the prompt.
- No NBA/NCAA/famous players/big arenas. No scoreboards.
- Faces may be visible but natural and unposed; no close-up portraits.

Respond with JSON only (no markdown):
{"prompt": "...", "negative_prompt": "..."}
prompt: 90–160 words, English, comma-separated concrete visual details, starting with "Photorealistic sports action photo,"
negative_prompt: 20–40 words (always include: text, numbers, logos, scoreboard, extra limbs, two balls, NBA, 3D render)`;
}

async function buildImagePrompt(
  ctx: NewsImageContext,
  gameData: GameImageData | null,
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

  return callDeepSeekForPrompt(systemPrompt, userContent);
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

  return callDeepSeekForPrompt(BRIEF_SYSTEM_PROMPT, userContent);
}

async function callDeepSeekForPrompt(
  systemPrompt: string,
  userContent: string,
): Promise<{ prompt: string; negativePrompt: string }> {
  const result = await deepseekJSON<{ prompt?: string; negative_prompt?: string }>({
    system: systemPrompt,
    user: userContent,
    maxTokens: 1000,
    temperature: 0.7,
    model: process.env.DEEPSEEK_TEXT_MODEL ?? "deepseek-chat",
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  const parsed = result.data;
  if (!parsed?.prompt || parsed.prompt.length < 30) {
    throw new Error(`DeepSeek prompt inválido: ${JSON.stringify(parsed).slice(0, 300)}`);
  }

  return {
    prompt: parsed.prompt.slice(0, 500),
    negativePrompt: (parsed.negative_prompt ?? STANDARD_NEGATIVE).slice(0, 300),
  };
}

// Fallback determinístico com dados reais quando DeepSeek falha
const ACTION_MOMENTS = [
  "a player in the home kit rising for a layup between two defenders in the away kit, ball leaving his fingertips toward the rim",
  "a player in the away kit releasing a jump shot while a home defender leaps with an outstretched arm",
  "players from both teams battling for a rebound under the basket, the ball just above their reaching hands",
  "a home player driving hard to the basket past an away defender, ball dribbled low, bodies leaning",
  "an away player attempting a block as a home player goes up for a shot close to the rim",
];

function buildFallbackPrompt(
  ctx: NewsImageContext,
  gameData: GameImageData | null
): { prompt: string; negativePrompt: string } {
  const homeKit = kitPhrase(gameData?.homeKit ?? null, "white jerseys");
  const awayKit = kitPhrase(gameData?.awayKit ?? null, "dark blue jerseys");
  const venue = gameData?.location ? `${gameData.location}, a Portuguese municipal sports hall` : "a Portuguese municipal sports hall";
  const seedStr = ctx.newsId || `${ctx.homeTeamName}${ctx.awayTeamName}`;
  const idx = [...seedStr].reduce((a, c) => a + c.charCodeAt(0), 0) % ACTION_MOMENTS.length;

  return { prompt: buildGamePhotoPrompt({ homeKit, awayKit, venue, moment: ACTION_MOMENTS[idx] }), negativePrompt: STANDARD_NEGATIVE };
}

/** Prompt base "jogo de basquetebol" — usado no fallback e na rota de teste. */
export function buildGamePhotoPrompt(o: { homeKit: string; awayKit: string; venue?: string; moment?: string }): string {
  return [
    "Photorealistic sports action photo, amateur veterans basketball game in progress,",
    `${o.moment ?? ACTION_MOMENTS[0]},`,
    `home team wearing ${o.homeKit}, away team wearing ${o.awayKit}, plain jerseys and shorts without numbers or lettering,`,
    "adult men aged 35 to 55 with ordinary athletic builds, some grey hair, sweat and real effort,",
    "exactly one orange basketball in the air, orange hoop with white net visible in frame,",
    `indoor ${o.venue ?? "Portuguese municipal sports hall"}, light wooden parquet with painted court lines, a few rows of bleachers with a small crowd, high ceiling with industrial lights,`,
    "courtside low angle, Canon EOS R3, 70-200mm f/2.8, 1/1000s freezing the action, shallow depth of field, softly blurred background, natural gym lighting, slight film grain, editorial newspaper sports photography",
  ].join(" ");
}

/** Rota de teste: gera só a foto (sem overlay) para validação visual. */
export async function generateTestGamePhoto(o: {
  homePrimary?: string | null; homeSecondary?: string | null;
  awayPrimary?: string | null; awaySecondary?: string | null;
  venue?: string | null; momentIndex?: number;
}): Promise<{ webp: Buffer; prompt: string; seed: number }> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error("FAL_KEY não configurada");
  const kit = (p?: string | null, s?: string | null): TeamKit => ({ primary_color: p ?? null, secondary_color: s ?? null, kit_description: null, logo_url: null });
  const prompt = buildGamePhotoPrompt({
    homeKit: kitPhrase(kit(o.homePrimary, o.homeSecondary), "white jerseys"),
    awayKit: kitPhrase(kit(o.awayPrimary, o.awaySecondary), "dark blue jerseys"),
    venue: o.venue ? `${o.venue}, a Portuguese municipal sports hall` : undefined,
    moment: ACTION_MOMENTS[Math.abs(o.momentIndex ?? 0) % ACTION_MOMENTS.length],
  });
  const { buffer, seed } = await callFalApi(prompt, STANDARD_NEGATIVE, falKey);
  const webp = await sharp(buffer).resize(1600, 900, { fit: "cover", position: "attention" }).webp({ quality: 88 }).toBuffer();
  return { webp, prompt, seed };
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
