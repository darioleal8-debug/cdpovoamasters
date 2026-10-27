import { analyzeSheet } from "./engine";
import { emptySheetData, PROCESSING_VERSION, SHEET_SCHEMA_VERSION } from "./schema";
import { enrichWithRoster, type Access, type GameInfo } from "./service";
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
): Promise<{ ok: boolean; error?: string; kind?: string }> {
  const cfg = visionConfig();
  const result = await analyzeGameSheet({ image, game: { home: game.home, away: game.away, date: game.date } });

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
    extraction_raw: { ...result.ai, rechecked_event_ids: result.recheckedEventIds },
    sheet_data: sheet,
    validation: analysis,
    ai_usage: result.usage,
    analysis_count: previousCount + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", importId);
  if (error) return { ok: false, error: `Erro ao gravar a análise: ${error.message}` };
  return { ok: true };
}
