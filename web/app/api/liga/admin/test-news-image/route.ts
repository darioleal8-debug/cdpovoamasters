/**
 * Rota de teste para geração da imagem notícia — só admin da liga.
 *
 * GET /api/liga/admin/test-news-image?home=GD%20André%20Soares&away=CBF%20Felgueiras%20BAD&homeScore=58&awayScore=31
 *
 * Devolve o WebP diretamente no browser para validação visual sem passar pela pipeline completa.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Auth: só admin da liga
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_liga_admin");
  if (!isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const home = searchParams.get("home") ?? "GD André Soares";
  const away = searchParams.get("away") ?? "CBF Felgueiras BAD";
  const homeScore = searchParams.get("homeScore") ? Number(searchParams.get("homeScore")) : 58;
  const awayScore = searchParams.get("awayScore") ? Number(searchParams.get("awayScore")) : 31;
  const jornada = searchParams.get("jornada") ? Number(searchParams.get("jornada")) : null;

  // Buscar kits/logos das equipas
  const [homeTeamRes, awayTeamRes] = await Promise.all([
    supabase.from("league_teams").select("primary_color, secondary_color, logo_url").ilike("name", home).maybeSingle(),
    supabase.from("league_teams").select("primary_color, secondary_color, logo_url").ilike("name", away).maybeSingle(),
  ]);

  // Fetch logos em base64
  async function fetchLogoB64(url: string | null): Promise<string | null> {
    if (!url) return null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") ?? "image/png";
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      return `data:${ct.split(";")[0].trim()};base64,${b64}`;
    } catch { return null; }
  }

  const [homeLogoB64, awayLogoB64] = await Promise.all([
    fetchLogoB64(homeTeamRes.data?.logo_url ?? null),
    fetchLogoB64(awayTeamRes.data?.logo_url ?? null),
  ]);

  console.log(`[test-news-image] home="${home}" away="${away}" homeScore=${homeScore} awayScore=${awayScore}`);
  console.log(`[test-news-image] homeLogo=${homeLogoB64 ? "ok" : "null"} awayLogo=${awayLogoB64 ? "ok" : "null"}`);

  // Gerar fundo sólido navy para teste (sem fal.ai)
  const bgBuffer = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: { r: 11, g: 22, b: 38 } },
  }).jpeg().toBuffer();

  // Construir SVG do scoreboard (mesma lógica do generate-image.ts)
  const svgBuffer = buildTestOverlay({
    homeTeamName: home, awayTeamName: away,
    homeScore, awayScore,
    homeLogoB64, awayLogoB64,
    homePrimaryColor: homeTeamRes.data?.primary_color ?? "#F97316",
    awayPrimaryColor: awayTeamRes.data?.primary_color ?? "#6366F1",
    jornadaInfo: jornada ? `Jornada ${jornada}` : null,
  });

  const webpBuffer = await sharp(bgBuffer)
    .composite([{ input: svgBuffer, blend: "over" }])
    .webp({ quality: 90 })
    .toBuffer();

  return new NextResponse(webpBuffer, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": `inline; filename="test-${home}-vs-${away}.webp"`,
      "Cache-Control": "no-store",
    },
  });
}

interface TestOverlayParams {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homeLogoB64: string | null;
  awayLogoB64: string | null;
  homePrimaryColor: string;
  awayPrimaryColor: string;
  jornadaInfo: string | null;
}

function buildTestOverlay(d: TestOverlayParams): Buffer {
  const W = 1600, H = 900;
  const FONT = "sans-serif";
  const GOLD = "#C8A852";
  const NAVY = "#0B1626";
  const PX = 80, PY = 200, PW = 1440, PH = 450;
  const HEADER_H = 52, FOOTER_H = 52;
  const CONTENT_TOP = PY + HEADER_H;
  const FOOTER_TOP = PY + PH - FOOTER_H;
  const HOME_CX = 320, SCORE_CX = 800, AWAY_CX = 1280;
  const LOGO_SZ = 120;
  const LOGO_TOP = 266;
  const LOGO_CY = LOGO_TOP + LOGO_SZ / 2;
  const NAME_Y = LOGO_TOP + LOGO_SZ + 38;
  const SCORE_Y = 392;
  const JORNADA_Y = FOOTER_TOP + Math.round(FOOTER_H / 2) + 6;

  const homeWins = d.homeScore > d.awayScore;
  const awayWins = d.awayScore > d.homeScore;

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

  const homeLogoEl = d.homeLogoB64
    ? `<image x="${HOME_CX - LOGO_SZ / 2}" y="${LOGO_TOP}" width="${LOGO_SZ}" height="${LOGO_SZ}" xlink:href="${d.homeLogoB64}" href="${d.homeLogoB64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${HOME_CX}" cy="${LOGO_CY}" r="${LOGO_SZ / 2 - 3}" fill="${escXml(d.homePrimaryColor)}" opacity="0.85"/><text x="${HOME_CX}" y="${LOGO_CY + 14}" font-family="${FONT}" font-size="38" font-weight="900" fill="white" text-anchor="middle">${escXml(d.homeTeamName.slice(0, 1))}</text>`;

  const awayLogoEl = d.awayLogoB64
    ? `<image x="${AWAY_CX - LOGO_SZ / 2}" y="${LOGO_TOP}" width="${LOGO_SZ}" height="${LOGO_SZ}" xlink:href="${d.awayLogoB64}" href="${d.awayLogoB64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${AWAY_CX}" cy="${LOGO_CY}" r="${LOGO_SZ / 2 - 3}" fill="${escXml(d.awayPrimaryColor)}" opacity="0.85"/><text x="${AWAY_CX}" y="${LOGO_CY + 14}" font-family="${FONT}" font-size="38" font-weight="900" fill="white" text-anchor="middle">${escXml(d.awayTeamName.slice(0, 1))}</text>`;

  const hc = homeWins ? GOLD : "white";
  const ac = awayWins ? GOLD : "white";

  const statusBadgeW = 196;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  <defs>
    <clipPath id="panelClip"><rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6"/></clipPath>
    <filter id="panelGlow" x="-6%" y="-6%" width="112%" height="112%">
      <feDropShadow dx="0" dy="6" stdDeviation="18" flood-color="#000" flood-opacity="0.60"/>
    </filter>
    <linearGradient id="goldShine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0"/>
      <stop offset="25%" stop-color="${GOLD}" stop-opacity="0.7"/>
      <stop offset="75%" stop-color="${GOLD}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="#000" opacity="0.35" filter="url(#panelGlow)"/>
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="${NAVY}" opacity="0.95"/>
  <rect x="${PX}" y="${PY}" width="${PW}" height="${HEADER_H}" clip-path="url(#panelClip)" fill="${GOLD}" opacity="0.09"/>
  <rect x="${PX + 2}" y="${PY + 2}" width="${PW - 4}" height="2" fill="url(#goldShine)"/>
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="6" fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.88"/>
  <line x1="${PX + 24}" y1="${CONTENT_TOP}" x2="${PX + PW - 24}" y2="${CONTENT_TOP}" stroke="${GOLD}" stroke-width="1" opacity="0.40"/>
  <line x1="${PX + 24}" y1="${FOOTER_TOP}" x2="${PX + PW - 24}" y2="${FOOTER_TOP}" stroke="${GOLD}" stroke-width="1" opacity="0.40"/>
  <line x1="560" y1="${CONTENT_TOP + 12}" x2="560" y2="${FOOTER_TOP - 12}" stroke="${GOLD}" stroke-width="1" opacity="0.18"/>
  <line x1="1040" y1="${CONTENT_TOP + 12}" x2="1040" y2="${FOOTER_TOP - 12}" stroke="${GOLD}" stroke-width="1" opacity="0.18"/>
  <rect x="${PX + 16}" y="${PY + 11}" width="130" height="30" rx="3" fill="${GOLD}" opacity="0.14"/>
  <rect x="${PX + 16}" y="${PY + 11}" width="130" height="30" rx="3" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.72"/>
  <text x="${PX + 81}" y="${PY + 31}" font-family="${FONT}" font-size="11" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="2.5">LIGA INATEL</text>
  <rect x="${SCORE_CX - statusBadgeW / 2}" y="${PY + 11}" width="${statusBadgeW}" height="30" rx="3" fill="${GOLD}" opacity="0.14"/>
  <rect x="${SCORE_CX - statusBadgeW / 2}" y="${PY + 11}" width="${statusBadgeW}" height="30" rx="3" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.85"/>
  <text x="${SCORE_CX}" y="${PY + 31}" font-family="${FONT}" font-size="11" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="2.5">RESULTADO FINAL</text>
  <rect x="${PX + PW - 16 - 224}" y="${PY + 11}" width="224" height="30" rx="3" fill="${GOLD}" opacity="0.14"/>
  <rect x="${PX + PW - 16 - 224}" y="${PY + 11}" width="224" height="30" rx="3" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.72"/>
  <text x="${PX + PW - 16 - 112}" y="${PY + 31}" font-family="${FONT}" font-size="11" font-weight="700" fill="${GOLD}" text-anchor="middle" letter-spacing="2.0">BASQUETEBOL VETERANOS</text>
  ${homeLogoEl}
  <text x="${HOME_CX}" y="${NAME_Y}" font-family="${FONT}" font-size="26" font-weight="700" fill="white" text-anchor="middle">${escXml(truncate(d.homeTeamName, 20))}</text>
  <text x="775" y="${SCORE_Y}" font-family="${FONT}" font-size="80" font-weight="900" fill="${hc}" text-anchor="end">${d.homeScore}</text>
  <text x="${SCORE_CX}" y="${SCORE_Y}" font-family="${FONT}" font-size="80" font-weight="900" fill="white" text-anchor="middle">-</text>
  <text x="825" y="${SCORE_Y}" font-family="${FONT}" font-size="80" font-weight="900" fill="${ac}" text-anchor="start">${d.awayScore}</text>
  ${awayLogoEl}
  <text x="${AWAY_CX}" y="${NAME_Y}" font-family="${FONT}" font-size="26" font-weight="700" fill="white" text-anchor="middle">${escXml(truncate(d.awayTeamName, 20))}</text>
  ${d.jornadaInfo ? `<text x="${SCORE_CX}" y="${JORNADA_Y}" font-family="${FONT}" font-size="13" font-weight="600" fill="${GOLD}" text-anchor="middle" letter-spacing="2.2" opacity="0.82">${escXml(d.jornadaInfo.toUpperCase())}</text>` : ""}
</svg>`;

  return Buffer.from(svg);
}
