import { NextResponse } from "next/server";
import { analyzeSheet, toLegacyExtraction } from "@/lib/game-sheet/engine";
import { authorizeGameSheet, importView, jsonError, loadGameForAccess, loadImport, parseSheet } from "@/lib/game-sheet/service";

export const runtime = "nodejs";

/**
 * Confirmar o boletim: recalcula e valida no servidor e cria/atualiza a submissão pendente
 * (o fluxo de aprovação pelo admin da liga mantém-se — é ele que publica).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeGameSheet();
  if (!auth.ok) return auth.response;
  const { access } = auth;
  if (!access.teamId) return jsonError("Só o delegado da equipa pode confirmar o boletim", 403);
  const { id } = await params;

  let body: { acknowledge_warnings?: boolean; notes?: string; version?: string } = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }

  const row = await loadImport(access, id);
  if (!row) return jsonError("Importação não encontrada", 404);
  if (row.team_id !== access.teamId) return jsonError("Sem permissão para este boletim", 403);
  if (row.status === "published") return jsonError("Este boletim já foi aprovado e publicado", 409);
  if (row.status === "processing" || row.status === "failed") {
    return jsonError("O boletim ainda não tem dados para confirmar", 409);
  }
  if (body.version && body.version !== row.updated_at) {
    return jsonError("O boletim foi alterado noutra sessão. Recarregue a página.", 409, { code: "stale" });
  }

  const parsed = parseSheet(row.sheet_data);
  if (!parsed.ok) return jsonError(parsed.error, 422);
  const sheet = parsed.sheet;
  const analysis = analyzeSheet(sheet); // nunca confiar na validação guardada/enviada

  if (!analysis.canConfirm) {
    return jsonError("Há erros que impedem a confirmação. Corrija-os primeiro.", 422, {
      code: "blocking_errors",
      issues: analysis.issues.filter((i) => i.severity === "error"),
    });
  }
  if (analysis.requiresAcknowledgement && body.acknowledge_warnings !== true) {
    return jsonError("Existem avisos por rever. Confirme que os reviu.", 422, {
      code: "needs_acknowledgement",
      issues: analysis.issues.filter((i) => i.severity === "warning"),
    });
  }

  const game = await loadGameForAccess(access, row.event_id);
  if (!game) return jsonError("Jogo não encontrado ou não pertence à sua equipa", 404);

  const { supabase, user } = access;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) || null : null;
  const payload = {
    home_team_name: game.home,
    away_team_name: game.away,
    home_score: sheet.final.home!,
    away_score: sheet.final.away!,
    submitted_by_name: access.teamName ?? "Delegado",
    submitted_by_team: access.teamName,
    submitted_by_user_id: user.id,
    photo_url: row.image_path,
    notes,
    extraction_raw: toLegacyExtraction(sheet, analysis),
    import_id: row.id,
  };

  // Uma submissão pendente por jogo (índice único). Só se atualiza a própria.
  const { data: pending } = await supabase
    .from("result_submissions")
    .select("id, submitted_by_user_id")
    .eq("event_id", game.id)
    .eq("status", "pending")
    .maybeSingle();

  let submissionId: string;
  if (pending) {
    if (pending.submitted_by_user_id !== user.id) {
      return jsonError("Já existe um resultado pendente submetido por outro delegado para este jogo. Contacte o admin da liga.", 409);
    }
    const { error } = await supabase
      .from("result_submissions")
      .update({ ...payload, submitted_at: new Date().toISOString() })
      .eq("id", pending.id);
    if (error) return jsonError(`Erro ao atualizar submissão: ${error.message}`, 500);
    submissionId = pending.id as string;
  } else {
    const { data: ins, error } = await supabase
      .from("result_submissions")
      .insert({ event_id: game.id, ...payload, status: "pending" })
      .select("id")
      .single();
    if (error || !ins) {
      if (error?.code === "23505") return jsonError("Já existe um resultado pendente para este jogo", 409);
      return jsonError(`Erro ao criar submissão: ${error?.message ?? "desconhecido"}`, 500);
    }
    submissionId = ins.id as string;
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("game_sheet_imports")
    .update({
      status: "confirmed",
      validation: analysis,
      submission_id: submissionId,
      confirmed_by: user.id,
      confirmed_at: now,
      updated_at: now,
    })
    .eq("id", row.id);
  if (upErr) return jsonError(`Erro ao confirmar: ${upErr.message}`, 500);

  const fresh = await loadImport(access, row.id);
  return NextResponse.json({ ...(await importView(access, fresh!, game)), submission_id: submissionId });
}
