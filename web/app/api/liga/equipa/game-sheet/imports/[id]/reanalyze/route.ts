import { NextResponse } from "next/server";
import { authorizeGameSheet, importView, jsonError, loadGameForAccess, loadImport } from "@/lib/game-sheet/service";
import { reanalyzeImport } from "@/lib/game-sheet/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reanalisar a imagem (limitado por GAME_SHEET_MAX_ANALYSES para controlar custos). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeGameSheet();
  if (!auth.ok) return auth.response;
  const { access } = auth;
  const { id } = await params;

  const row = await loadImport(access, id);
  if (!row) return jsonError("Importação não encontrada", 404);
  if (!["needs_review", "ready_to_confirm", "failed"].includes(row.status)) {
    return jsonError("Só é possível reanalisar um boletim por confirmar", 409);
  }
  const game = await loadGameForAccess(access, row.event_id);
  if (!game) return jsonError("Jogo não encontrado", 404);

  const run = await reanalyzeImport(access, row, game);
  if (!run.ok) return jsonError(run.error, run.status);
  const fresh = await loadImport(access, row.id);
  return NextResponse.json({
    ...(await importView(access, fresh!, game)),
    analysis_error: run.error ?? null,
    analysis_error_kind: run.kind ?? null,
  });
}
