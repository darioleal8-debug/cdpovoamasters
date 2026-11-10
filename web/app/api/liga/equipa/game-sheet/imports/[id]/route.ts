import { NextResponse } from "next/server";
import { analyzeSheet } from "@/lib/game-sheet/engine";
import {
  authorizeGameSheet, diffSheets, importView, jsonError, loadGameForAccess, loadImport, parseSheet,
} from "@/lib/game-sheet/service";
import { SheetDataSchema } from "@/lib/game-sheet/schema";
import { ProStatsDataSchema, STAT_KEYS, type ProStatsData } from "@/lib/match-docs/pro-stats-schema";
import { validateProStats } from "@/lib/match-docs/validate";
import { proStatsStatus } from "@/lib/match-docs/pro-stats-extract";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Rascunho da importação: dados, validação e URL temporário da imagem original. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await authorizeGameSheet();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const row = await loadImport(auth.access, id);
  if (!row) return jsonError("Importação não encontrada", 404);
  const game = await loadGameForAccess(auth.access, row.event_id);
  return NextResponse.json(await importView(auth.access, row, game));
}

/** Guardar rascunho: valida no servidor, recalcula estatísticas e regista a correção. */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await authorizeGameSheet();
  if (!auth.ok) return auth.response;
  const { access } = auth;
  const { id } = await params;

  const row = await loadImport(access, id);
  if (!row) return jsonError("Importação não encontrada", 404);
  if (row.status === "processing") return jsonError("A análise ainda está a decorrer", 409);
  if (row.status === "published" && !access.isLigaAdmin) {
    return jsonError("Este boletim já foi aprovado. Para corrigir, importe novamente o boletim.", 409);
  }

  let body: { sheet?: unknown; stats?: unknown; version?: string };
  try { body = await req.json(); } catch { return jsonError("JSON inválido", 400); }
  if (body.version && body.version !== row.updated_at) {
    return jsonError("O boletim foi alterado noutra sessão. Recarregue a página.", 409, { code: "stale" });
  }

  if (row.doc_type === "pro_stats") {
    // Correção manual das estatísticas profissionais lidas (validação por código no servidor)
    const parsedStats = ProStatsDataSchema.safeParse(body.stats);
    if (!parsedStats.success) {
      const first = parsedStats.error.issues[0];
      return jsonError(`Dados inválidos em ${first.path.join(".")}: ${first.message}`, 400);
    }
    const game = await loadGameForAccess(access, row.event_id);
    if (!game) return jsonError("Jogo não encontrado", 404);
    const prev = ProStatsDataSchema.safeParse(row.stats_data);
    const changes = prev.success ? diffProStats(prev.data, parsedStats.data) : ["preenchimento manual"];
    const issues = validateProStats(parsedStats.data, { names: { home: game.home, away: game.away } });
    const corrections = Array.isArray(row.corrections) ? row.corrections : [];
    const now = new Date().toISOString();
    const { data: updated, error } = await access.supabase.from("game_sheet_imports").update({
      stats_data: parsedStats.data,
      validation: { issues },
      status: proStatsStatus(parsedStats.data, issues),
      error: null,
      corrections: changes.length ? [...corrections, { at: now, by: access.user.id, changes }].slice(-100) : corrections,
      updated_at: now,
    }).eq("id", row.id).eq("updated_at", row.updated_at).select("id").maybeSingle();
    if (error) return jsonError(`Erro ao guardar: ${error.message}`, 500);
    if (!updated) return jsonError("O documento foi alterado noutra sessão. Recarregue a página.", 409, { code: "stale" });
    const fresh = await loadImport(access, row.id);
    return NextResponse.json({ ...(await importView(access, fresh!, game)), needs_reconfirmation: row.status === "confirmed" });
  }

  const parsed = parseSheet(body.sheet);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const game = await loadGameForAccess(access, row.event_id);
  if (!game) return jsonError("Jogo não encontrado", 404);

  // As equipas do jogo não são editáveis pelo cliente
  const sheet = {
    ...parsed.sheet,
    teams: {
      home: { ...parsed.sheet.teams.home, name: game.home },
      away: { ...parsed.sheet.teams.away, name: game.away },
    },
  };
  const analysis = analyzeSheet(sheet);
  const prev = SheetDataSchema.safeParse(row.sheet_data);
  const changes = diffSheets(prev.success ? prev.data : null, sheet);
  const corrections = Array.isArray(row.corrections) ? row.corrections : [];
  const now = new Date().toISOString();

  const { data: updated, error } = await access.supabase
    .from("game_sheet_imports")
    .update({
      sheet_data: sheet,
      validation: analysis,
      status: analysis.status, // editar depois de confirmar obriga a reconfirmar
      error: null,
      corrections: changes.length
        ? [...corrections, { at: now, by: access.user.id, changes }].slice(-100)
        : corrections,
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at) // concorrência otimista
    .select("id")
    .maybeSingle();
  if (error) return jsonError(`Erro ao guardar: ${error.message}`, 500);
  if (!updated) return jsonError("O boletim foi alterado noutra sessão. Recarregue a página.", 409, { code: "stale" });

  const fresh = await loadImport(access, row.id);
  return NextResponse.json({
    ...(await importView(access, fresh!, game)),
    needs_reconfirmation: row.status === "confirmed",
  });
}

/** Diferenças entre duas versões das estatísticas (registo de correções: valor anterior → novo). */
function diffProStats(before: ProStatsData, after: ProStatsData): string[] {
  const out: string[] = [];
  for (const side of ["home", "away"] as const) {
    const b = before.teams[side];
    const a = after.teams[side];
    if (!a || !b) continue;
    for (const pa of a.players) {
      const pb = b.players.find((x) => x.id === pa.id);
      if (!pb) { out.push(`+ jogador ${pa.name}`); continue; }
      if (pb.name !== pa.name) out.push(`${pb.name}: nome → ${pa.name}`);
      for (const k of STAT_KEYS) if (pb.stats[k] !== pa.stats[k]) out.push(`${pa.name} ${k}: ${pb.stats[k] ?? "—"} → ${pa.stats[k] ?? "—"}`);
    }
    for (const k of STAT_KEYS) if (b.totals[k] !== a.totals[k]) out.push(`Totais ${side} ${k}: ${b.totals[k] ?? "—"} → ${a.totals[k] ?? "—"}`);
  }
  if (JSON.stringify(before.periods) !== JSON.stringify(after.periods)) out.push("parciais");
  if (JSON.stringify(before.final) !== JSON.stringify(after.final)) out.push(`resultado ${before.final.home ?? "?"}-${before.final.away ?? "?"} → ${after.final.home ?? "?"}-${after.final.away ?? "?"}`);
  return out.slice(0, 60);
}
