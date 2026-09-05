import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseHistBoxScoreWithDeepSeek, parseHistBoxScoreFromImage } from "@/lib/hist-importer/parser";
import { matchHistPlayers } from "@/lib/hist-importer/matcher";
import type { HistCandidate, HistImportAnalysis } from "@/lib/hist-importer/types";

export const runtime = "nodejs";

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const db = adminClient();
  const { data: profile } = await db.from("users").select("role").eq("id", authUser.id).single();
  if (!profile || !["admin", "treinador"].includes(profile.role)) return fail("Sem permissão", 403);

  let pdfFile: File;
  let histSeasonId: string;
  let teamNameOverride: string | undefined;
  try {
    const fd = await req.formData();
    const f  = fd.get("pdf") as File | null;
    if (!f) return fail("Campo 'pdf' em falta");
    if (f.size > 20 * 1024 * 1024) return fail("Ficheiro demasiado grande (máx 20 MB)");
    pdfFile          = f;
    histSeasonId     = String(fd.get("hist_season_id") ?? "").trim();
    if (!histSeasonId) return fail("hist_season_id é obrigatório");
    const override   = String(fd.get("team_name_override") ?? "").trim();
    teamNameOverride = override || undefined;
  } catch {
    return fail("Erro ao processar FormData");
  }

  // Validate season exists
  const { data: season } = await db.from("hist_seasons").select("id").eq("id", histSeasonId).single();
  if (!season) return fail("Temporada não encontrada", 404);

  const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  const isImage = IMAGE_TYPES.includes(pdfFile.type);

  // Call AI parser — image path uses Claude Vision, PDF path uses pdf-parse + DeepSeek
  let parsed;
  try {
    if (isImage) {
      const imageBuffer = Buffer.from(await pdfFile.arrayBuffer());
      console.log(`[hist-import] Image: ${pdfFile.type}, ${imageBuffer.length} bytes`);
      parsed = await parseHistBoxScoreFromImage(imageBuffer, pdfFile.type, teamNameOverride);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { PDFParse } = await import("pdf-parse") as any;
      if (typeof PDFParse !== "function") throw new Error("pdf-parse: PDFParse não é uma classe");
      const ab     = await pdfFile.arrayBuffer();
      const parser = new PDFParse({ data: Buffer.from(ab), verbosity: 0 });
      const result = await parser.getText() as { text: string; total: number };
      const pdfText = result.text;
      console.log(`[hist-import] PDF: ${result.total} pgs, ${pdfText.length} chars`);
      console.log(`[hist-import] PDF TEXT SAMPLE:\n${pdfText.slice(0, 3000)}`);
      if (pdfText.trim().length < 50) return fail("O PDF não tem texto extraível (pode ser um scan).", 422);
      parsed = await parseHistBoxScoreWithDeepSeek(pdfText, teamNameOverride);
    }
  } catch (err) {
    return fail(`Erro na análise IA: ${(err as Error).message}`, 502);
  }

  if (!parsed.players.length) {
    return NextResponse.json(
      { error: "A IA não identificou jogadores do CD Póvoa neste ficheiro.", code: "players_not_found" },
      { status: 422 }
    );
  }

  // Load existing hist_players for matching
  const { data: existingPlayers } = await db
    .from("hist_players")
    .select("id, name")
    .order("name");

  const roster: HistCandidate[] = (existingPlayers ?? []).map((p) => ({ id: p.id, name: p.name }));
  const rows = matchHistPlayers(parsed.players, roster);

  const analysis: HistImportAnalysis = {
    rows,
    game_meta: parsed.gameMeta,
    ai_log:    parsed.aiLog,
    errors:    parsed.errors,
  };

  return NextResponse.json({ analysis, pdf_filename: pdfFile.name });
}
