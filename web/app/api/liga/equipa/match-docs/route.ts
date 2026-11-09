import { NextResponse } from "next/server";
import { authorizeGameSheet, BUCKET, isUuid, jsonError, loadGameForAccess } from "@/lib/game-sheet/service";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATUS_PT: Record<string, string> = {
  pending_submission: "À espera da documentação das duas equipas",
  analyzing: "Em análise",
  validated: "Validado",
  discrepancies: "Divergências detetadas — em análise pelo admin da liga",
  manual_review: "Revisão manual pelo admin da liga",
};

/**
 * Documentos submetidos pela PRÓPRIA equipa para um jogo (folha oficial + estatísticas
 * profissionais) e o estado global da validação do jogo (sem dados da outra equipa).
 */
export async function GET(req: Request) {
  const auth = await authorizeGameSheet();
  if (!auth.ok) return auth.response;
  const { access } = auth;
  const gameId = new URL(req.url).searchParams.get("game_id");
  if (!isUuid(gameId)) return jsonError("Jogo inválido", 400);
  const game = await loadGameForAccess(access, gameId);
  if (!game) return jsonError("Jogo não encontrado ou não pertence à sua equipa", 404);

  let q = access.supabase
    .from("game_sheet_imports")
    .select("id, doc_type, status, image_path, image_mime, page_count, error, analysis_count, created_at, updated_at, confirmed_at, stats_data, sheet_data, validation")
    .eq("event_id", game.id)
    .order("created_at", { ascending: false });
  if (access.teamId) q = q.eq("team_id", access.teamId);
  const { data: rows, error } = await q;
  if (error) return jsonError(error.message, 500);

  const docs = await Promise.all((rows ?? []).map(async (r) => {
    let url: string | null = null;
    if (r.image_path) {
      const { data } = await access.supabase.storage.from(BUCKET).createSignedUrl(r.image_path as string, 60 * 30);
      url = data?.signedUrl ?? null;
    }
    const stats = r.doc_type === "pro_stats" ? r.stats_data as { app?: string | null; final?: { home: number | null; away: number | null }; teams?: Record<string, { players?: unknown[]; teamOnly?: boolean } | null> } | null : null;
    const sheet = r.doc_type !== "pro_stats" ? r.sheet_data as { final?: { home: number | null; away: number | null } } | null : null;
    const issues = r.doc_type === "pro_stats" ? ((r.validation as { issues?: { severity: string; message: string }[] } | null)?.issues ?? []) : [];
    return {
      id: r.id, doc_type: r.doc_type, status: r.status, image_url: url, image_mime: r.image_mime, page_count: r.page_count,
      error: r.error, analysis_count: r.analysis_count, created_at: r.created_at, updated_at: r.updated_at, confirmed_at: r.confirmed_at,
      summary: stats
        ? { app: stats.app ?? null, final: stats.final ?? null, players: { home: stats.teams?.home?.players?.length ?? 0, away: stats.teams?.away?.players?.length ?? 0 } }
        : { final: sheet?.final ?? null },
      errors: issues.filter((i) => i.severity === "error").map((i) => i.message).slice(0, 8),
    };
  }));

  // Estado global da validação (apenas o estado e se cada equipa já submeteu)
  let validation: { status: string; label: string; teams_submitted: { home: boolean; away: boolean } } | null = null;
  try {
    const db = await createAdminClient();
    const { data: rec } = await db.from("match_reconciliations").select("status, consolidated").eq("event_id", game.id).maybeSingle();
    if (rec) {
      const ts = (rec.consolidated as { teamsSubmitted?: { home: boolean; away: boolean } } | null)?.teamsSubmitted ?? { home: false, away: false };
      validation = { status: rec.status as string, label: STATUS_PT[rec.status as string] ?? (rec.status as string), teams_submitted: ts };
    }
  } catch { /* opcional */ }

  return NextResponse.json({ game: { id: game.id, home: game.home, away: game.away, date: game.date }, docs, validation });
}
