import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { adminAccess, analyzeSheetCandidate } from "@/lib/game-sheet/admin-sheets";
import { isUuid, jsonError, loadGameForAccess } from "@/lib/game-sheet/service";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/liga/admin/games/[eventId]/sheets/analyze — analisa UMA folha do jogo
// (o painel chama-a folha a folha: cada leitura pode demorar até ~1 min)
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const access = adminAccess(auth.supabase, auth.user);
  const { eventId } = await params;

  if (!process.env.DEEPSEEK_API_KEY) return jsonError("Leitura automática indisponível (DEEPSEEK_API_KEY não configurada)", 503);

  let body: { kind?: string; id?: string; force?: boolean };
  try { body = await req.json(); } catch { return jsonError("JSON inválido", 400); }
  if ((body.kind !== "import" && body.kind !== "submission") || !isUuid(body.id)) {
    return jsonError("Folha inválida", 400);
  }

  const game = await loadGameForAccess(access, eventId);
  if (!game) return jsonError("Jogo não encontrado", 404);

  const out = await analyzeSheetCandidate(access, await createAdminClient(), game, {
    kind: body.kind, id: body.id, force: body.force === true,
  });
  if (!out.ok) return jsonError(out.error, out.status);
  return NextResponse.json(out);
}
