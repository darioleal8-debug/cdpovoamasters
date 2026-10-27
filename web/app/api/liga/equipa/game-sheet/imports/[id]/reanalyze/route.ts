import { NextResponse } from "next/server";
import { authorizeGameSheet, BUCKET, importView, jsonError, loadGameForAccess, loadImport } from "@/lib/game-sheet/service";
import { runAndStore } from "@/lib/game-sheet/run";
import { visionConfig } from "@/lib/game-sheet/vision";

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
  const { maxAnalyses } = visionConfig();
  if (row.analysis_count >= maxAnalyses) {
    return jsonError(`Limite de ${maxAnalyses} análises atingido para este boletim. Corrija os dados manualmente.`, 429);
  }
  if (!row.image_path) return jsonError("Imagem original indisponível", 404);
  const game = await loadGameForAccess(access, row.event_id);
  if (!game) return jsonError("Jogo não encontrado", 404);

  // Passa a 'processing' só se ninguém o fez entretanto (o índice único impede 2 análises do mesmo jogo)
  const { data: locked, error: lockErr } = await access.supabase
    .from("game_sheet_imports")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (lockErr && lockErr.code !== "23505") return jsonError(lockErr.message, 500);
  if (!locked) return jsonError("Já existe uma análise em curso para este jogo", 409);

  const { data: blob, error: dlErr } = await access.supabase.storage.from(BUCKET).download(row.image_path);
  if (dlErr || !blob) {
    await access.supabase.from("game_sheet_imports").update({ status: row.status }).eq("id", row.id);
    return jsonError("Não foi possível obter a imagem original", 500);
  }

  const run = await runAndStore(access, row.id, Buffer.from(await blob.arrayBuffer()), game, row.analysis_count);
  const fresh = await loadImport(access, row.id);
  return NextResponse.json({
    ...(await importView(access, fresh!, game)),
    analysis_error: run.ok ? null : run.error,
    analysis_error_kind: run.kind ?? null,
  });
}
