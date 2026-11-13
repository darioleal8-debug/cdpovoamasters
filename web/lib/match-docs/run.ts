/**
 * Corre a extração de estatísticas profissionais e grava o resultado na importação
 * (status 'processing' → needs_review | ready_to_confirm | failed). Mesmo padrão do boletim:
 * a sessão do utilizador (RLS) é usada para gravar; falhas da API nunca apagam o documento.
 */
import { withAiAttribution } from "@/lib/ai-usage";
import { createRawServiceClient } from "@/lib/supabase/service-raw";
import { BUCKET, type Access, type GameInfo, type ImportRow } from "@/lib/game-sheet/service";
import { createAdminClient } from "@/lib/supabase/server";
import { sniffImageMime } from "@/lib/game-sheet/image";
import { extractProStats, proStatsConfig, proStatsStatus } from "./pro-stats-extract";
import { PRO_PROCESSING_VERSION, PRO_STATS_SCHEMA_VERSION, type ProStatsData } from "./pro-stats-schema";
import { loadKnownPlayers, loadMatchGame, rosterHintForEvent } from "./service";
import { matchPlayers, playerNameScore } from "./reconcile";
import { classifyDocument, OVERRIDE_CONFIDENCE } from "./classify";

/** Marca os jogadores lidos que constam da base de dados (plantel HoopHub / histórico da liga). */
async function markKnownPlayers(eventId: string, data: ProStatsData): Promise<void> {
  try {
    const db = await createAdminClient();
    const game = await loadMatchGame(db, eventId);
    if (!game) return;
    const known = await loadKnownPlayers(db, game);
    for (const side of ["home", "away"] as const) {
      const team = data.teams[side];
      if (!team || known[side].length === 0) continue;
      const { pairs } = matchPlayers(team.players, known[side]);
      for (const p of team.players) p.inDatabase = false;
      for (const [p, k] of pairs) {
        if (p.number !== null && k.number !== null && p.number !== k.number && playerNameScore(p.name, k.name) < 0.85) continue;
        p.inDatabase = true;
        if (k.hoophubPlayerId) p.hoophubPlayerId = k.hoophubPlayerId;
      }
    }
  } catch (e) {
    console.warn("[pro-stats] associação à base de dados falhou", e);
  }
}

export async function runProStatsAndStore(
  access: Access,
  importId: string,
  buffer: Buffer,
  game: GameInfo,
  previousCount: number,
  adminInstructions?: string,
): Promise<{ ok: boolean; error?: string; kind?: string }> {
  const cfg = proStatsConfig();
  const mime = sniffImageMime(buffer) ?? "image/jpeg";
  const rosterHint = await rosterHintForEvent(game.id);
  const { data: impRow } = await createRawServiceClient().from("game_sheet_imports").select("team_id").eq("id", importId).maybeSingle();
  const result = await withAiAttribution({ leagueTeamId: (impRow?.team_id as string | null) ?? access.teamId, feature: "liga-estatisticas" }, () => extractProStats({
    buffer, mime, game: { home: game.home, away: game.away, date: game.date },
    submittingTeam: access.teamName, adminInstructions, rosterHint,
  }));

  if (!result.ok) {
    console.error(`[pro-stats] análise falhou import=${importId} kind=${result.kind} model=${cfg.model} ms=${result.usage.totalDurationMs}`);
    await access.supabase.from("game_sheet_imports").update({
      status: "failed", error: result.error, model: cfg.model, ai_usage: result.usage,
      analysis_count: previousCount + 1, page_count: result.pageCount || null, updated_at: new Date().toISOString(),
    }).eq("id", importId);
    return { ok: false, error: result.error, kind: result.kind };
  }

  await markKnownPlayers(game.id, result.data);
  const status = proStatsStatus(result.data, result.issues);
  console.info(
    `[pro-stats] import=${importId} status=${status} model=${cfg.model} ms=${result.usage.totalDurationMs} calls=${result.usage.calls.length} ` +
    `images=${result.usage.images} text=${result.usage.usedTextLayer} tokens=${result.usage.promptTokens}p/${result.usage.completionTokens}c ` +
    `issues=${result.issues.filter((i) => i.severity === "error").length} second=${result.usage.secondPass}`,
  );
  const { error } = await access.supabase.from("game_sheet_imports").update({
    status, error: null, schema_version: PRO_STATS_SCHEMA_VERSION, processing_version: PRO_PROCESSING_VERSION, model: cfg.model,
    extraction_raw: { ...(result.raw as object), corrected: result.corrected, ...(adminInstructions?.trim() ? { admin_instructions: adminInstructions.trim() } : {}) },
    stats_data: result.data, validation: { issues: result.issues }, ai_usage: result.usage,
    analysis_count: previousCount + 1, page_count: result.pageCount, updated_at: new Date().toISOString(),
  }).eq("id", importId);
  if (error) return { ok: false, error: `Erro ao gravar a análise: ${error.message}` };
  return { ok: true };
}

/** Reanálise de um documento de estatísticas já guardado (mesmo bloqueio otimista do boletim). */
export async function reanalyzeProStats(
  access: Access,
  row: ImportRow,
  game: GameInfo,
  opts: { instructions?: string; maxAnalyses?: number } = {},
): Promise<{ ok: true; error?: string } | { ok: false; status: number; error: string }> {
  const max = opts.maxAnalyses ?? 3;
  const adminOverride = access.isLigaAdmin;
  if (row.analysis_count >= max && !adminOverride) {
    return { ok: false, status: 429, error: `Limite de ${max} análises atingido para este documento.` };
  }
  if (!row.image_path) return { ok: false, status: 404, error: "Documento original indisponível" };
  const { data: locked } = await access.supabase.from("game_sheet_imports")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("updated_at", row.updated_at).select("id").maybeSingle();
  if (!locked) return { ok: false, status: 409, error: "Já existe uma análise em curso para este documento" };
  const { data: blob, error: dlErr } = await access.supabase.storage.from(BUCKET).download(row.image_path);
  if (dlErr || !blob) {
    await access.supabase.from("game_sheet_imports").update({ status: row.status }).eq("id", row.id);
    return { ok: false, status: 500, error: "Não foi possível obter o documento original" };
  }
  const run = await runProStatsAndStore(access, row.id, Buffer.from(await blob.arrayBuffer()), game, row.analysis_count, opts.instructions);
  return { ok: true, error: run.ok ? undefined : run.error };
}

/**
 * Uma importação gravada como folha oficial cujo conteúdo é, na verdade, uma tabela de estatísticas
 * (ex.: captura de ecrã do Pocket Stat enviada no slot errado) passa a 'pro_stats' e é relida com o
 * extrator certo. Devolve a linha atualizada, ou null se o documento é mesmo uma folha oficial
 * (ou se a classificação não é confiante — nunca se converte na dúvida).
 */
export async function convertToProStatsIfNeeded(access: Access, row: ImportRow): Promise<ImportRow | null> {
  if (row.doc_type === "pro_stats" || !row.image_path) return null;
  const { data: blob, error } = await access.supabase.storage.from(BUCKET).download(row.image_path);
  if (error || !blob) return null;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = sniffImageMime(buffer);
  if (!mime) return null;
  const c = await withAiAttribution({ leagueTeamId: (row as { team_id?: string | null }).team_id ?? access.teamId, feature: "liga-classificacao" }, () => classifyDocument({ buffer, mime, declared: "official_sheet" }));
  if (c.kind !== "pro_stats" || c.confidence < OVERRIDE_CONFIDENCE) return null;
  const { error: updErr } = await access.supabase.from("game_sheet_imports")
    .update({ doc_type: "pro_stats", updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("updated_at", row.updated_at);
  if (updErr) {
    // Já existe outro documento de estatísticas desta equipa em processamento (índice único): mantém o tipo
    console.warn(`[match-docs] conversão para pro_stats falhou import=${row.id}: ${updErr.message}`);
    return null;
  }
  console.info(`[match-docs] import=${row.id} reclassificado official_sheet → pro_stats (${c.method}, conf=${c.confidence}${c.app ? `, app=${c.app}` : ""})`);
  const { data: fresh } = await access.supabase.from("game_sheet_imports").select("id, updated_at").eq("id", row.id).maybeSingle();
  return { ...row, doc_type: "pro_stats", updated_at: (fresh?.updated_at as string) ?? row.updated_at };
}
