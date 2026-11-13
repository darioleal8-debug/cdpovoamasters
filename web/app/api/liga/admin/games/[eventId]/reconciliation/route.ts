import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { BUCKET, isUuid, jsonError, loadImport, type GameInfo } from "@/lib/game-sheet/service";
import { adminAccess } from "@/lib/game-sheet/admin-sheets";
import { reanalyzeImport } from "@/lib/game-sheet/run";
import { visionConfig } from "@/lib/game-sheet/vision";
import { MAX_ADMIN_INSTRUCTIONS } from "@/lib/game-sheet/prompt";
import { reanalyzeProStats } from "@/lib/match-docs/run";
import { inputsHash, loadMatchDocs, loadMatchGame, loadReconciliationRow, runReconciliation, sideOfTeam } from "@/lib/match-docs/service";
import { isValidOverridePath, pathLabel, type ReconciliationResult, type Val } from "@/lib/match-docs/reconcile";
import { approveFromReconciliation } from "@/lib/match-docs/approve-flow";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ eventId: string }> };

/** Valor atual de um caminho no consolidado (para registar o valor anterior de uma correção). */
function valueAt(r: ReconciliationResult | null, path: string): Val {
  if (!r) return null;
  const p = path.split(".");
  if (p[0] === "final") return r.final[p[1] as "home" | "away"] ?? null;
  if (p[0] === "periods") return r.periods.find((x) => x.period === Number(p[1]))?.[p[2] as "home" | "away"] ?? null;
  if (p[0] === "players") {
    const pl = r.players.find((x) => x.key === p[1]);
    if (!pl) return null;
    if (p[2] === "name") return pl.name;
    if (p[2] === "number") return pl.number;
    return (pl.stats as Record<string, number | null>)[p[2]] ?? null;
  }
  return null;
}

/** Painel de validação: documentos das duas equipas, extração, consolidado, divergências e correções. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const { eventId } = await params;
  if (!isUuid(eventId)) return jsonError("Jogo inválido", 400);

  const db = await createUnscopedAdminClient();
  const game = await loadMatchGame(db, eventId);
  if (!game) return jsonError("Jogo não encontrado", 404);
  const docs = await loadMatchDocs(db, eventId);
  let row = await loadReconciliationRow(db, eventId);

  // Documentos mudaram desde a última análise → recalcula (só código; a IA corre em "Reanalisar")
  if (docs.length && (!row || row.inputs_hash !== inputsHash(docs) || !row.consolidated)) {
    const run = await runReconciliation(eventId, { ai: "off", db });
    if (run.ok) row = await loadReconciliationRow(db, eventId);
  }

  const documents = await Promise.all(docs.map(async (d) => {
    let url: string | null = null;
    if (d.image_path) {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(d.image_path, 60 * 30);
      url = data?.signedUrl ?? null;
    }
    const side = sideOfTeam(game, d.team_id);
    return {
      id: d.id, doc_type: d.doc_type, status: d.status, team_side: side, team_name: side ? game[side] : d.team_id ? "Outra equipa" : "Admin",
      image_url: url, image_mime: d.image_mime, page_count: d.page_count, error: d.error, analysis_count: d.analysis_count,
      created_at: d.created_at, confirmed_at: d.confirmed_at,
      counted: Boolean((row?.consolidated as ReconciliationResult | null)?.usedDocs?.includes(d.id)),
      stats: d.doc_type === "pro_stats" ? d.stats_data : null,
      issues: d.doc_type === "pro_stats" ? ((d.validation as { issues?: unknown[] } | null)?.issues ?? []) : null,
      sheet: d.doc_type === "official_sheet" ? d.sheet_data : null,
    };
  }));

  const { data: corrections } = await auth.supabase
    .from("match_reconciliation_corrections")
    .select("id, field_path, old_value, new_value, reason, corrected_by, corrected_at")
    .eq("event_id", eventId)
    .order("corrected_at", { ascending: false })
    .limit(100);
  const consolidated = (row?.consolidated as ReconciliationResult | null) ?? null;

  const { data: pending } = await db.from("result_submissions").select("id, submitted_by_team, home_score, away_score, submitted_at").eq("event_id", eventId).eq("status", "pending").maybeSingle();
  const { data: result } = await db.from("league_game_results").select("home_score, away_score, approved_at").eq("event_id", eventId).maybeSingle();

  return NextResponse.json({
    game: { id: game.id, home: game.home, away: game.away, date: game.date, is_test: game.isTest },
    reconciliation: row ? {
      status: row.status, consolidated, confidence: row.confidence, ai_review: row.ai_review, ai_usage: row.ai_usage,
      overrides: row.overrides, run_count: row.run_count, error: row.error, analyzed_at: row.analyzed_at, approved_at: row.approved_at,
    } : null,
    documents,
    corrections: (corrections ?? []).map((c) => ({ ...c, label: pathLabel(c.field_path as string, consolidated) })),
    pending_submission: pending ?? null,
    approved_result: result ?? null,
  });
}

type Body =
  | { action: "run"; force?: boolean }
  | { action: "correct"; path: string; value: Val; reason?: string }
  | { action: "clear_correction"; path: string; reason?: string }
  | { action: "resolve"; discrepancy_id: string; reason?: string }
  | { action: "reanalyze_doc"; import_id: string; instructions?: string }
  | { action: "approve"; motivo: string; acknowledge?: boolean };

export async function POST(req: Request, { params }: Params) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const { eventId } = await params;
  if (!isUuid(eventId)) return jsonError("Jogo inválido", 400);
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return jsonError("JSON inválido", 400); }

  const db = await createUnscopedAdminClient();
  const game = await loadMatchGame(db, eventId);
  if (!game) return jsonError("Jogo não encontrado", 404);

  switch (body.action) {
    case "run": {
      const r = await runReconciliation(eventId, { ai: body.force === false ? "auto" : "force", db });
      if (!r.ok) return jsonError(r.error, 500);
      return NextResponse.json({ ok: true, status: r.result.status, ai_ran: r.aiRan, ai_error: r.aiError });
    }

    case "correct":
    case "clear_correction":
    case "resolve": {
      const path = body.action === "resolve" ? `resolve.${body.discrepancy_id}` : body.path;
      if (typeof path !== "string" || !isValidOverridePath(path)) return jsonError("Campo inválido", 400);
      let value: Val = null;
      if (body.action === "correct") {
        const v = body.value;
        if (typeof v === "number") {
          if (!Number.isInteger(v) || v < -999 || v > 6000) return jsonError("Valor inválido", 400);
          value = v;
        } else if (typeof v === "string") {
          value = v.trim().slice(0, 200);
          if (!/\.name$/.test(path) && !Number.isFinite(Number(value))) return jsonError("Valor numérico inválido", 400);
          if (!/\.name$/.test(path)) value = Number(value);
        } else if (v === null) {
          value = null; // "não disponível" explícito
        } else return jsonError("Valor inválido", 400);
      }
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      const row = await loadReconciliationRow(db, eventId);
      const current = (row?.consolidated as ReconciliationResult | null) ?? null;
      const overrides: Record<string, Val> = { ...(row?.overrides ?? {}) };
      const oldValue = body.action === "resolve" ? (overrides[path] ?? null) : path in overrides ? overrides[path] : valueAt(current, path);
      if (body.action === "clear_correction") delete overrides[path];
      else overrides[path] = body.action === "resolve" ? 1 : value;

      // Registo de auditoria (sessão do admin: corrected_by = auth.uid())
      const { error: logErr } = await auth.supabase.from("match_reconciliation_corrections").insert({
        event_id: eventId, field_path: path, old_value: oldValue, new_value: body.action === "clear_correction" ? null : overrides[path],
        reason: reason || (body.action === "clear_correction" ? "Correção removida" : body.action === "resolve" ? "Divergência aceite pelo admin" : null),
        corrected_by: auth.user.id,
      });
      if (logErr) return jsonError(`Erro ao registar a correção: ${logErr.message}`, 500);
      const { error: upErr } = await db.from("match_reconciliations").upsert({ event_id: eventId, overrides, updated_at: new Date().toISOString() }, { onConflict: "event_id" });
      if (upErr) return jsonError(`Erro ao guardar a correção: ${upErr.message}`, 500);
      const r = await runReconciliation(eventId, { ai: "off", db });
      if (!r.ok) return jsonError(r.error, 500);
      return NextResponse.json({ ok: true, status: r.result.status, publishable: r.result.publishable });
    }

    case "reanalyze_doc": {
      if (!isUuid(body.import_id)) return jsonError("Documento inválido", 400);
      const instructions = typeof body.instructions === "string" && body.instructions.trim() ? body.instructions.trim() : undefined;
      if (instructions && instructions.length > MAX_ADMIN_INSTRUCTIONS) return jsonError(`Instruções demasiado longas (máx. ${MAX_ADMIN_INSTRUCTIONS})`, 400);
      const access = adminAccess(auth.supabase, auth.user);
      const row = await loadImport(access, body.import_id);
      if (!row || row.event_id !== eventId) return jsonError("Documento não encontrado", 404);
      if (row.status === "processing") return jsonError("Já existe uma análise em curso para este documento", 409);
      if (row.status === "published") return jsonError("Documento já publicado. Aprove novamente depois de corrigir.", 409);
      const gameInfo: GameInfo = { id: game.id, date: game.date, home: game.home, away: game.away, isTest: game.isTest };
      // A reanálise devolve o documento a "por confirmar"; os dados do delegado mantêm-se no histórico de correções
      const wasConfirmed = row.status === "confirmed";
      const r = row.doc_type === "pro_stats"
        ? await reanalyzeProStats(access, row, gameInfo, { instructions, maxAnalyses: visionConfig().maxAnalyses })
        : await reanalyzeImport(access, row, gameInfo, { instructions });
      if (!r.ok) return jsonError(r.error, r.status);
      // O admin reanalisou um documento já confirmado pela equipa: mantém-no a contar na validação
      if (wasConfirmed && !r.error) {
        await db.from("game_sheet_imports").update({ status: "confirmed" }).eq("id", row.id).in("status", ["needs_review", "ready_to_confirm"]);
      }
      const rec = await runReconciliation(eventId, { ai: "auto", db });
      return NextResponse.json({ ok: true, analysis_error: r.error ?? null, status: rec.ok ? rec.result.status : null });
    }

    case "approve": {
      if (typeof body.motivo !== "string" || !body.motivo.trim()) return jsonError("motivo obrigatório", 400);
      const out = await approveFromReconciliation({
        eventId, motivo: body.motivo, acknowledge: body.acknowledge === true, userId: auth.user.id,
        userClient: auth.supabase, schedule: (fn) => after(fn),
      });
      if (!out.ok) return jsonError(out.error, out.status, { code: out.code, details: out.details });
      revalidatePath("/liga-inatel", "layout");
      return NextResponse.json(out);
    }

    default:
      return jsonError("Ação desconhecida", 400);
  }
}
