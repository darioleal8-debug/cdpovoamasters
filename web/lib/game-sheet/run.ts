import { analyzeSheet } from "./engine";
import { callOpencvService, sniffImageMime } from "./image";
import { emptySheetData, PROCESSING_VERSION, SHEET_SCHEMA_VERSION } from "./schema";
import { BUCKET, enrichWithRoster, type Access, type GameInfo, type ImportRow } from "./service";
import { analyzeGameSheet, visionConfig } from "./vision";

/**
 * Corre a interpretação visual + motor e grava o resultado na importação (status
 * 'processing' → needs_review | ready_to_confirm | failed). Devolve a mensagem de erro, se houver.
 */
export async function runAndStore(
  access: Access,
  importId: string,
  image: Buffer,
  game: GameInfo,
  previousCount: number,
  adminInstructions?: string,
): Promise<{ ok: boolean; error?: string; kind?: string }> {
  const cfg = visionConfig();

  const mime = sniffImageMime(image);
  const opencvResult = mime ? await callOpencvService(image, mime) : null;
  if (opencvResult) {
    const q = opencvResult.quality;
    console.info(
      `[opencv] import=${importId} perspective=${opencvResult.perspectiveApplied} ` +
      `sharpness=${q.sharpness.toFixed(0)} legibility=${q.legibility.toFixed(2)} blurry=${q.isBlurry}`,
    );
  }

  const result = await analyzeGameSheet({
    image: opencvResult?.buffer ?? image,
    game: { home: game.home, away: game.away, date: game.date },
    adminInstructions,
    opencvZones: opencvResult?.zones,
  });

  if (!result.ok) {
    // Falha: o rascunho fica disponível para preenchimento manual (sem inventar dados)
    console.error(`[game-sheet] análise falhou import=${importId} kind=${result.kind} model=${cfg.model} ms=${result.usage.totalDurationMs}`);
    await access.supabase.from("game_sheet_imports").update({
      status: "failed",
      error: result.error,
      model: cfg.model,
      ai_usage: result.usage,
      analysis_count: previousCount + 1,
      sheet_data: emptySheetData({ home: game.home, away: game.away }),
      validation: null,
      cv_data: opencvResult
        ? { perspective_applied: opencvResult.perspectiveApplied, quality: opencvResult.quality, zones: opencvResult.zones }
        : null,
      updated_at: new Date().toISOString(),
    }).eq("id", importId);
    return { ok: false, error: result.error, kind: result.kind };
  }

  const sheet = await enrichWithRoster(access.supabase, result.sheet);
  const analysis = analyzeSheet(sheet);
  console.info(
    `[game-sheet] import=${importId} status=${analysis.status} model=${cfg.model} ms=${result.usage.totalDurationMs} ` +
    `calls=${result.usage.calls.length} tokens=${result.usage.promptTokens}p/${result.usage.completionTokens}c ` +
    `events=${sheet.events.length} issues=${analysis.issues.length}`,
  );
  const { error } = await access.supabase.from("game_sheet_imports").update({
    status: analysis.status,
    error: null,
    schema_version: SHEET_SCHEMA_VERSION,
    processing_version: PROCESSING_VERSION,
    model: cfg.model,
    extraction_raw: {
      ...result.ai,
      rechecked_event_ids: result.recheckedEventIds,
      ...(adminInstructions?.trim() ? { admin_instructions: adminInstructions.trim() } : {}),
    },
    sheet_data: sheet,
    validation: analysis,
    ai_usage: result.usage,
    analysis_count: previousCount + 1,
    cv_data: opencvResult
      ? { perspective_applied: opencvResult.perspectiveApplied, quality: opencvResult.quality, zones: opencvResult.zones }
      : null,
    updated_at: new Date().toISOString(),
  }).eq("id", importId);
  if (error) return { ok: false, error: `Erro ao gravar a análise: ${error.message}` };
  return { ok: true };
}

export type ReanalyzeResult =
  | { ok: true; error?: string; kind?: string }
  | { ok: false; status: number; error: string };

/**
 * Volta a analisar a imagem guardada de uma importação: bloqueia (status 'processing', com
 * concorrência otimista), descarrega a imagem original e corre a análise.
 */
export async function reanalyzeImport(
  access: Access,
  row: ImportRow,
  game: GameInfo,
  opts: { instructions?: string } = {},
): Promise<ReanalyzeResult> {
  const { maxAnalyses } = visionConfig();
  // O admin da liga não fica preso ao limite quando dá instruções à IA (é a forma de corrigir a leitura)
  const adminOverride = access.isLigaAdmin && Boolean(opts.instructions?.trim());
  if (row.analysis_count >= maxAnalyses && !adminOverride) {
    return { ok: false, status: 429, error: `Limite de ${maxAnalyses} análises atingido para este boletim. Corrija os dados manualmente.` };
  }
  if (!row.image_path) return { ok: false, status: 404, error: "Imagem original indisponível" };

  // Passa a 'processing' só se ninguém o fez entretanto (o índice único impede 2 análises do mesmo jogo)
  const { data: locked, error: lockErr } = await access.supabase
    .from("game_sheet_imports")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (lockErr && lockErr.code !== "23505") return { ok: false, status: 500, error: lockErr.message };
  if (!locked) return { ok: false, status: 409, error: "Já existe uma análise em curso para este jogo" };

  const { data: blob, error: dlErr } = await access.supabase.storage.from(BUCKET).download(row.image_path);
  if (dlErr || !blob) {
    await access.supabase.from("game_sheet_imports").update({ status: row.status }).eq("id", row.id);
    return { ok: false, status: 500, error: "Não foi possível obter a imagem original" };
  }

  const run = await runAndStore(access, row.id, Buffer.from(await blob.arrayBuffer()), game, row.analysis_count, opts.instructions);
  return { ok: true, error: run.ok ? undefined : run.error, kind: run.kind };
}
