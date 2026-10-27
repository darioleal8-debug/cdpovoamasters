import { NextResponse } from "next/server";
import { analyzeSheet } from "@/lib/game-sheet/engine";
import {
  authorizeGameSheet, diffSheets, importView, jsonError, loadGameForAccess, loadImport, parseSheet,
} from "@/lib/game-sheet/service";
import { SheetDataSchema } from "@/lib/game-sheet/schema";

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
  if (row.status === "published") {
    return jsonError("Este boletim já foi aprovado. Para corrigir, importe novamente o boletim.", 409);
  }

  let body: { sheet?: unknown; version?: string };
  try { body = await req.json(); } catch { return jsonError("JSON inválido", 400); }
  if (body.version && body.version !== row.updated_at) {
    return jsonError("O boletim foi alterado noutra sessão. Recarregue a página.", 409, { code: "stale" });
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
