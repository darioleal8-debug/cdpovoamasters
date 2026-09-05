import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseBoxScoreWithDeepSeek, parseBoxScoreFromImage } from "@/lib/stats-importer/deepseek";
import { matchPlayers } from "@/lib/stats-importer/matcher";
import type { RosterCandidate, ImportAnalysis } from "@/lib/stats-importer/types";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;

  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const db = adminClient();

  const { data: profile } = await db
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!profile || !["admin", "treinador"].includes(profile.role)) {
    return fail("Sem permissão", 403);
  }

  // Parse FormData
  let pdfFile: File;
  let sessionId: string;
  let teamNameOverride: string | undefined;
  try {
    const fd = await req.formData();
    const f  = fd.get("pdf") as File | null;
    if (!f) return fail("Campo 'pdf' em falta");
    if (f.size > 20 * 1024 * 1024) return fail("PDF demasiado grande (máx 20 MB)");
    pdfFile          = f;
    sessionId        = String(fd.get("session_id") ?? "").trim();
    const override   = String(fd.get("team_name_override") ?? "").trim();
    teamNameOverride = override || undefined;
  } catch {
    return fail("Erro ao processar FormData");
  }

  // Resolve game session
  if (!sessionId) {
    const { data: s } = await db
      .from("game_sessions")
      .select("id")
      .eq("event_id", eventId)
      .single();
    if (!s) return fail("Sessão de jogo não encontrada para este evento", 404);
    sessionId = s.id;
  }

  const { data: session } = await db
    .from("game_sessions")
    .select("id, season_id, opponent_name")
    .eq("id", sessionId)
    .single();
  if (!session) return fail("Sessão de jogo não encontrada", 404);

  // Load roster for this season
  const { data: players } = await db
    .from("players")
    .select("id, name, number")
    .eq("season_id", session.season_id);

  const roster: RosterCandidate[] = (players ?? []).map((p) => ({
    id:     p.id,
    name:   p.name,
    number: p.number ?? null,
  }));

  const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  const isImage = IMAGE_TYPES.includes(pdfFile.type);

  // Call AI parser — image path uses Claude Vision, PDF path uses pdf-parse + DeepSeek
  let parsed;
  try {
    if (isImage) {
      const imageBuffer = Buffer.from(await pdfFile.arrayBuffer());
      console.log(`[import-stats] Image: ${pdfFile.type}, ${imageBuffer.length} bytes`);
      parsed = await parseBoxScoreFromImage(imageBuffer, pdfFile.type, teamNameOverride);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { PDFParse } = await import("pdf-parse") as any;
      if (typeof PDFParse !== "function") throw new Error("pdf-parse: PDFParse não é uma classe");
      const ab     = await pdfFile.arrayBuffer();
      const parser = new PDFParse({ data: Buffer.from(ab), verbosity: 0 });
      const result = await parser.getText() as { text: string; total: number };
      const pdfText = result.text;
      console.log(`[import-stats] PDF: ${result.total} pages, ${pdfText.length} chars`);
      if (pdfText.trim().length < 50) return fail("O PDF não tem texto extraível (pode ser um scan).", 422);
      parsed = await parseBoxScoreWithDeepSeek(pdfText, teamNameOverride);
    }
  } catch (err) {
    return fail(`Erro na análise IA: ${(err as Error).message}`, 502);
  }

  if (!parsed.extracted.length) {
    return NextResponse.json(
      { error: "A IA não identificou jogadores do CD Póvoa neste ficheiro.", code: "players_not_found" },
      { status: 422 }
    );
  }

  // Player matching
  const matchedRows = matchPlayers(parsed.extracted, roster);

  const analysis: ImportAnalysis = {
    rows:           matchedRows,
    pdf_home_team:  parsed.teamName,
    pdf_opponent:   parsed.opponentName,
    pdf_home_score: parsed.homeScore,
    pdf_away_score: parsed.awayScore,
    ai_log:         parsed.aiLog,
    errors:         parsed.errors,
  };

  return NextResponse.json({ analysis, session_id: sessionId });
}
