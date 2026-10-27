import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { adminAccess } from "@/lib/game-sheet/admin-sheets";
import { buildApprovalPlan } from "@/lib/game-sheet/approval";
import { analyzeSheet, toLegacyExtraction } from "@/lib/game-sheet/engine";
import { jsonError, loadGameForAccess, loadImport, parseSheet } from "@/lib/game-sheet/service";
import { generateLigaNews } from "@/lib/liga/generate-news";
import { generateNewsImage } from "@/lib/liga/generate-image";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/liga/admin/game-sheets/[importId]/apply
 * O admin aplica ao jogo o boletim revisto (ex.: a melhor folha). Cria uma submissão do admin
 * ligada à importação e aprova-a na mesma função transacional usada nas aprovações normais:
 * substitui resultado, parciais, estatísticas e marcha, com auditoria do valor anterior.
 */
export async function POST(req: Request, { params }: { params: Promise<{ importId: string }> }) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const access = adminAccess(auth.supabase, auth.user);
  const { importId } = await params;

  let body: { motivo?: string; acknowledge_warnings?: boolean; regenerate_news?: boolean; version?: string } = {};
  try { body = await req.json(); } catch { /* validado abaixo */ }
  const motivo = (body.motivo ?? "").trim().slice(0, 500);
  if (!motivo) return jsonError("motivo obrigatório", 400);

  const row = await loadImport(access, importId);
  if (!row) return jsonError("Importação não encontrada", 404);
  if (!["needs_review", "ready_to_confirm", "confirmed"].includes(row.status)) {
    return jsonError(row.status === "published" ? "Este boletim já está aplicado ao jogo" : "O boletim ainda não tem dados para aplicar", 409);
  }
  if (body.version && body.version !== row.updated_at) {
    return jsonError("O boletim foi alterado noutra sessão. Recarregue a página.", 409, { code: "stale" });
  }

  const parsed = parseSheet(row.sheet_data);
  if (!parsed.ok) return jsonError(parsed.error, 422);
  const analysis = analyzeSheet(parsed.sheet);
  if (!analysis.canConfirm) {
    return jsonError("Há erros que impedem aplicar este boletim. Corrija-os primeiro.", 422, {
      code: "blocking_errors", issues: analysis.issues.filter((i) => i.severity === "error"),
    });
  }
  if (analysis.requiresAcknowledgement && body.acknowledge_warnings !== true) {
    return jsonError("Existem avisos por rever. Confirme que os reviu.", 422, {
      code: "needs_acknowledgement", issues: analysis.issues.filter((i) => i.severity === "warning"),
    });
  }

  const game = await loadGameForAccess(access, row.event_id);
  if (!game) return jsonError("Jogo não encontrado", 404);
  const sheet = parsed.sheet;
  const { supabase, user } = access;

  // Uma submissão pendente por jogo: a de outro boletim tem de ser tratada primeiro
  const { data: pending } = await supabase
    .from("result_submissions")
    .select("id, import_id")
    .eq("event_id", game.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pending && pending.import_id !== row.id) {
    return jsonError("Este jogo tem uma submissão pendente de um delegado. Aprove-a ou rejeite-a antes de aplicar outro boletim.", 409);
  }

  const payload = {
    home_team_name: game.home,
    away_team_name: game.away,
    home_score: sheet.final.home!,
    away_score: sheet.final.away!,
    submitted_by_name: "Admin da liga",
    submitted_by_team: null,
    submitted_by_user_id: user.id,
    photo_url: row.image_path,
    notes: motivo,
    extraction_raw: toLegacyExtraction(sheet, analysis),
    import_id: row.id,
  };

  let submissionId: string;
  if (pending) {
    // Submissão pendente do próprio boletim (ex.: do delegado): mantém autor e notas, atualiza os dados
    const { error } = await supabase
      .from("result_submissions")
      .update({
        home_score: payload.home_score,
        away_score: payload.away_score,
        photo_url: payload.photo_url,
        extraction_raw: payload.extraction_raw,
        import_id: payload.import_id,
      })
      .eq("id", pending.id);
    if (error) return jsonError(`Erro ao preparar a submissão: ${error.message}`, 500);
    submissionId = pending.id as string;
  } else {
    const { data: ins, error } = await supabase
      .from("result_submissions")
      .insert({ event_id: game.id, ...payload, status: "pending" })
      .select("id")
      .single();
    if (error || !ins) return jsonError(`Erro ao preparar a submissão: ${error?.message ?? "desconhecido"}`, 500);
    submissionId = ins.id as string;
  }

  const now = new Date().toISOString();
  const { error: confErr } = await supabase
    .from("game_sheet_imports")
    .update({ status: "confirmed", validation: analysis, submission_id: submissionId, confirmed_by: user.id, confirmed_at: now, updated_at: now })
    .eq("id", row.id);
  if (confErr) return jsonError(`Erro ao confirmar o boletim: ${confErr.message}`, 500);

  const plan = buildApprovalPlan(
    { home_score: payload.home_score, away_score: payload.away_score, extraction_raw: payload.extraction_raw, import_id: row.id },
    { status: "confirmed", sheet_data: sheet },
  );
  if (!plan.ok) return jsonError(plan.error, plan.status);

  // Resultado, parciais, estatísticas, marcha, estado da importação e auditoria: uma transação
  const { error: applyErr } = await supabase.rpc("liga_apply_game_sheet", {
    p_submission_id: submissionId,
    p_motivo: motivo,
    p_payload: plan.payload,
  });
  if (applyErr) {
    console.error(`[game-sheets/apply] liga_apply_game_sheet falhou import=${row.id}: ${applyErr.message}`);
    return jsonError(`Erro ao aplicar o resultado (a submissão ficou pendente na administração): ${applyErr.message}`, 500);
  }

  if (body.regenerate_news === true && !game.isTest) {
    after(async () => {
      const news = await generateLigaNews(game.id);
      if (!news.ok) {
        console.error(`[game-sheets/apply] generateLigaNews falhou game_id=${game.id}: ${news.error}`);
        return;
      }
      const img = await generateNewsImage({ newsId: news.news_id, ...news.newsContext });
      if (!img.ok) console.error(`[game-sheets/apply] generateNewsImage falhou news_id=${news.news_id}: ${img.errorType}`);
    });
  }

  revalidatePath("/liga-inatel", "layout");
  return NextResponse.json({ ok: true, submission_id: submissionId, news_regenerating: body.regenerate_news === true && !game.isTest });
}
