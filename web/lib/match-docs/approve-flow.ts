/**
 * Aprovação de um jogo a partir da validação cruzada (admin da liga).
 *  - recalcula a reconciliação (sem IA) para usar o estado atual dos documentos e correções
 *  - bloqueia divergências relevantes / erros matemáticos sem reconhecimento explícito
 *  - aplica tudo numa transação (liga_apply_game_sheet, sessão do admin)
 *  - gera a notícia: publicada só se os dados forem publicáveis, senão fica em rascunho
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { generateLigaNews } from "@/lib/liga/generate-news";
import { generateNewsImage } from "@/lib/liga/generate-image";
import { blockingMathIssues, openRelevantDiscrepancies, toConsolidatedApplyPayload } from "./approval";
import { buildInputs, loadMatchDocs, loadMatchGame, runReconciliation } from "./service";

export type ApproveOutcome =
  | { ok: true; eventId: string; publishable: boolean; status: string; newsQueued: boolean; isTest: boolean }
  | { ok: false; status: number; error: string; code?: string; details?: unknown };

export async function approveFromReconciliation(opts: {
  eventId: string;
  motivo: string;
  acknowledge: boolean;
  userId: string;
  /** Cliente com a sessão do admin (a RPC valida is_liga_admin()) */
  userClient: SupabaseClient;
  /** Agenda trabalho depois da resposta (next/server after) */
  schedule: (fn: () => Promise<void>) => void;
}): Promise<ApproveOutcome> {
  const db = await createAdminClient();
  const run = await runReconciliation(opts.eventId, { ai: "off", db });
  if (!run.ok) return { ok: false, status: 404, error: run.error };
  const r = run.result;

  if (r.final.home === null || r.final.away === null) {
    return { ok: false, status: 422, error: "Não há resultado final consolidado. Corrija o resultado antes de aprovar.", code: "no_final" };
  }
  const open = openRelevantDiscrepancies(r);
  const math = blockingMathIssues(r);
  if ((open.length || math.length || !r.publishable) && !opts.acknowledge) {
    return {
      ok: false, status: 409, code: "needs_acknowledgement",
      error: "Existem divergências relevantes, erros matemáticos ou confiança insuficiente. Confirme que quer aprovar assim (a notícia ficará em rascunho).",
      details: { discrepancies: open.map((d) => d.label), math: math.map((m) => m.message), status: r.status },
    };
  }

  const docs = await loadMatchDocs(db, opts.eventId);
  const { data: event } = await db.from("events").select("description, is_test").eq("id", opts.eventId).maybeSingle();
  const game = await loadMatchGame(db, opts.eventId);
  if (!game) return { ok: false, status: 404, error: "Jogo não encontrado" };
  const { official } = buildInputs(game, docs);
  const counted = docs.filter((d) => r.usedDocs.includes(d.id) || d.status === "confirmed").map((d) => d.id);
  const payload = toConsolidatedApplyPayload(r, official, counted);

  // Submissão pendente do jogo (uma por jogo); se não existir (ex.: só estatísticas), cria-a
  let { data: pending } = await db.from("result_submissions").select("id").eq("event_id", opts.eventId).eq("status", "pending").maybeSingle();
  if (!pending) {
    const linkImport = docs.find((d) => d.doc_type === "official_sheet" && d.status === "confirmed" && r.usedDocs.includes(d.id)) ?? null;
    const { data: ins, error } = await db.from("result_submissions").insert({
      event_id: opts.eventId, home_team_name: game.home, away_team_name: game.away,
      home_score: r.final.home, away_score: r.final.away,
      submitted_by_name: "Validação cruzada (admin da liga)", submitted_by_user_id: opts.userId,
      notes: "Criada a partir dos dados consolidados da validação cruzada.", status: "pending",
      import_id: linkImport?.id ?? null,
    }).select("id").single();
    if (error || !ins) return { ok: false, status: 500, error: `Erro ao criar a submissão: ${error?.message ?? "desconhecido"}` };
    pending = ins;
  }

  const { error: applyErr } = await opts.userClient.rpc("liga_apply_game_sheet", {
    p_submission_id: pending.id, p_motivo: opts.motivo.trim(), p_payload: payload,
  });
  if (applyErr) {
    console.error(`[match-docs/approve] liga_apply_game_sheet falhou event=${opts.eventId}: ${applyErr.message}`);
    return { ok: false, status: 500, error: `Erro ao aplicar o resultado: ${applyErr.message}` };
  }

  const isTest = event?.is_test === true || game.isTest;
  if (!isTest) {
    opts.schedule(async () => {
      const news = await generateLigaNews(opts.eventId);
      if (!news.ok) { console.error(`[match-docs/approve] notícia falhou event=${opts.eventId}: ${news.error}`); return; }
      const img = await generateNewsImage({ newsId: news.news_id, ...news.newsContext });
      if (!img.ok) console.error(`[match-docs/approve] imagem falhou news=${news.news_id}: ${img.errorType}`);
    });
  }
  return { ok: true, eventId: opts.eventId, publishable: r.publishable, status: r.status, newsQueued: !isTest, isTest };
}
