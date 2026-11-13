import { after, NextResponse } from "next/server";
import { analyzeSheet, toLegacyExtraction } from "@/lib/game-sheet/engine";
import { authorizeGameSheet, importView, jsonError, loadGameForAccess, loadImport, parseSheet, type Access, type GameInfo } from "@/lib/game-sheet/service";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { ProStatsDataSchema } from "@/lib/match-docs/pro-stats-schema";
import { validateProStats } from "@/lib/match-docs/validate";
import { safeRunReconciliation } from "@/lib/match-docs/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Submissão pendente do jogo (uma por jogo), lida com o cliente de serviço DEPOIS de autorizado. */
async function pendingSubmission(gameId: string): Promise<{ id: string; submitted_by_user_id: string | null } | null> {
  const db = await createUnscopedAdminClient();
  const { data } = await db.from("result_submissions").select("id, submitted_by_user_id").eq("event_id", gameId).eq("status", "pending").maybeSingle();
  return (data as { id: string; submitted_by_user_id: string | null } | null) ?? null;
}

/**
 * Confirmar um documento do jogo.
 *  - Folha oficial: recalcula e valida no servidor e cria/atualiza a submissão pendente. Se a
 *    outra equipa já submeteu, a folha fica associada à submissão existente (sem a substituir) e
 *    entra na validação cruzada.
 *  - Estatísticas profissionais: valida por código e confirma; entram na validação cruzada.
 * Em ambos os casos a validação cruzada corre depois da resposta (assíncrona).
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
  if (row.status === "published") return jsonError("Este documento já foi aprovado e publicado", 409);
  if (row.status === "processing" || row.status === "failed") {
    return jsonError("O documento ainda não tem dados para confirmar", 409);
  }
  if (body.version && body.version !== row.updated_at) {
    return jsonError("O documento foi alterado noutra sessão. Recarregue a página.", 409, { code: "stale" });
  }

  const game = await loadGameForAccess(access, row.event_id);
  if (!game) return jsonError("Jogo não encontrado ou não pertence à sua equipa", 404);

  if (row.doc_type === "pro_stats") return confirmProStats(access, row, game, body);

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

  // Uma submissão pendente por jogo (índice único). Só se atualiza a própria; se for da outra
  // equipa, a folha fica associada a ela e entra na validação cruzada (sem a substituir).
  const pending = await pendingSubmission(game.id);
  let submissionId: string;
  let sharedWithOtherTeam = false;
  if (pending && pending.submitted_by_user_id !== user.id) {
    submissionId = pending.id;
    sharedWithOtherTeam = true;
  } else if (pending) {
    const { error } = await supabase
      .from("result_submissions")
      .update({ ...payload, submitted_at: new Date().toISOString() })
      .eq("id", pending.id);
    if (error) return jsonError(`Erro ao atualizar submissão: ${error.message}`, 500);
    submissionId = pending.id;
  } else {
    const { data: ins, error } = await supabase
      .from("result_submissions")
      .insert({ event_id: game.id, ...payload, status: "pending" })
      .select("id")
      .single();
    if (error || !ins) {
      if (error?.code === "23505") {
        // Corrida com a outra equipa: associa à submissão que acabou de ser criada
        const again = await pendingSubmission(game.id);
        if (!again) return jsonError("Já existe um resultado pendente para este jogo", 409);
        submissionId = again.id;
        sharedWithOtherTeam = true;
      } else {
        return jsonError(`Erro ao criar submissão: ${error?.message ?? "desconhecido"}`, 500);
      }
    } else {
      submissionId = ins.id as string;
    }
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

  after(() => safeRunReconciliation(game.id));

  const fresh = await loadImport(access, row.id);
  return NextResponse.json({
    ...(await importView(access, fresh!, game)),
    submission_id: submissionId,
    shared_with_other_team: sharedWithOtherTeam,
  });
}

async function confirmProStats(
  access: Access,
  row: NonNullable<Awaited<ReturnType<typeof loadImport>>>,
  game: GameInfo,
  body: { acknowledge_warnings?: boolean },
) {
  const parsed = ProStatsDataSchema.safeParse(row.stats_data);
  if (!parsed.success) return jsonError("Dados de estatísticas inválidos. Reanalise o documento.", 422);
  const issues = validateProStats(parsed.data, { names: { home: game.home, away: game.away } });
  const errors = issues.filter((i) => i.severity === "error");
  // Inconsistências matemáticas não impedem a submissão (o admin vê-as na validação cruzada),
  // mas o delegado tem de confirmar explicitamente que as reviu.
  if (errors.length && body.acknowledge_warnings !== true) {
    return jsonError("A leitura tem inconsistências matemáticas. Corrija-as ou confirme que as reviu.", 422, {
      code: "needs_acknowledgement", issues: errors,
    });
  }
  const pending = await pendingSubmission(game.id);
  const now = new Date().toISOString();
  const { error } = await access.supabase.from("game_sheet_imports").update({
    status: "confirmed", validation: { issues }, submission_id: pending?.id ?? null,
    confirmed_by: access.user.id, confirmed_at: now, updated_at: now,
  }).eq("id", row.id);
  if (error) return jsonError(`Erro ao confirmar: ${error.message}`, 500);

  after(() => safeRunReconciliation(game.id));
  const fresh = await loadImport(access, row.id);
  return NextResponse.json({ ...(await importView(access, fresh!, game)), submission_id: pending?.id ?? null });
}
