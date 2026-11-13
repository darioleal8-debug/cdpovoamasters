import { NextResponse } from "next/server";
import { authorizeGameSheet, importView, jsonError, loadGameForAccess, loadImport } from "@/lib/game-sheet/service";
import { reanalyzeImport } from "@/lib/game-sheet/run";
import { MAX_ADMIN_INSTRUCTIONS } from "@/lib/game-sheet/prompt";
import { convertToProStatsIfNeeded, reanalyzeProStats } from "@/lib/match-docs/run";
import { visionConfig } from "@/lib/game-sheet/vision";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reanalisar a imagem (limitado por GAME_SHEET_MAX_ANALYSES para controlar custos). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeGameSheet();
  if (!auth.ok) return auth.response;
  const { access } = auth;
  const { id } = await params;

  // Instruções livres para a IA: só o admin da liga
  let instructions: string | undefined;
  try {
    const body = (await req.json()) as { instructions?: unknown };
    if (typeof body.instructions === "string" && body.instructions.trim()) instructions = body.instructions.trim();
  } catch { /* sem corpo: reanálise normal */ }
  if (instructions && !access.isLigaAdmin) return jsonError("Só o admin da liga pode dar instruções à IA", 403);
  if (instructions && instructions.length > MAX_ADMIN_INSTRUCTIONS) {
    return jsonError(`Instruções demasiado longas (máx. ${MAX_ADMIN_INSTRUCTIONS} caracteres)`, 400);
  }

  const row = await loadImport(access, id);
  if (!row) return jsonError("Importação não encontrada", 404);
  if (!["needs_review", "ready_to_confirm", "failed"].includes(row.status)) {
    return jsonError("Só é possível reanalisar um boletim por confirmar", 409);
  }
  const game = await loadGameForAccess(access, row.event_id);
  if (!game) return jsonError("Jogo não encontrado", 404);

  // Folha oficial cujo conteúdo é uma tabela de estatísticas → relê com o extrator de estatísticas
  const converted = row.doc_type === "pro_stats" ? null : await convertToProStatsIfNeeded(access, row);
  if (converted) row.doc_type = "pro_stats", row.updated_at = converted.updated_at;

  if (row.doc_type === "pro_stats") {
    const pr = await reanalyzeProStats(access, row, game, { instructions, maxAnalyses: visionConfig().maxAnalyses });
    if (!pr.ok) return jsonError(pr.error, pr.status);
    const freshPro = await loadImport(access, row.id);
    return NextResponse.json({ ...(await importView(access, freshPro!, game)), analysis_error: pr.error ?? null, analysis_error_kind: null });
  }
  const run = await reanalyzeImport(access, row, game, { instructions });
  if (!run.ok) return jsonError(run.error, run.status);
  const fresh = await loadImport(access, row.id);
  return NextResponse.json({
    ...(await importView(access, fresh!, game)),
    analysis_error: run.error ?? null,
    analysis_error_kind: run.kind ?? null,
  });
}
