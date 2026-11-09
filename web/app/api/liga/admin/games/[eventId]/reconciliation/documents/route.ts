import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { isUuid, jsonError, type GameInfo } from "@/lib/game-sheet/service";
import { adminAccess, createAndAnalyze } from "@/lib/game-sheet/admin-sheets";
import { isPdf, MAX_PDF_BYTES, MAX_REQUEST_BYTES, sniffImageMime } from "@/lib/game-sheet/image";
import { loadMatchGame, runReconciliation } from "@/lib/match-docs/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** O admin acrescenta um documento ao jogo (folha oficial ou estatísticas profissionais). */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const { eventId } = await params;
  if (!isUuid(eventId)) return jsonError("Jogo inválido", 400);
  if (!process.env.DEEPSEEK_API_KEY) return jsonError("Leitura automática indisponível (DEEPSEEK_API_KEY não configurada)", 503);

  let form: FormData;
  try { form = await req.formData(); } catch { return jsonError("Payload inválido", 400); }
  const file = form.get("file");
  const docType = form.get("doc_type") === "pro_stats" ? "pro_stats" : "official_sheet";
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_PDF_BYTES) return jsonError("Ficheiro em falta ou demasiado grande", 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(buffer);
  if (!mime) return jsonError("Formato não suportado. Use JPEG, PNG, WebP ou PDF.", 400);
  if (!isPdf(mime) && buffer.length > MAX_REQUEST_BYTES) return jsonError("Imagem demasiado grande (máx. 4 MB).", 400);

  const db = await createAdminClient();
  const game = await loadMatchGame(db, eventId);
  if (!game) return jsonError("Jogo não encontrado", 404);
  const info: GameInfo = { id: game.id, date: game.date, home: game.home, away: game.away, isTest: game.isTest };
  const out = await createAndAnalyze(adminAccess(auth.supabase, auth.user), db, info, buffer, mime, { docType });
  if (!out.ok) return jsonError(out.error, out.status);
  const rec = await runReconciliation(eventId, { ai: "auto", db });
  return NextResponse.json({ ok: true, import_id: out.import_id, analysis_error: out.analysis_error, reused: out.skipped ?? false, status: rec.ok ? rec.result.status : null });
}
