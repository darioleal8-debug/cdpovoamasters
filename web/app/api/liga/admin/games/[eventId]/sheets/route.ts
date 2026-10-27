import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { adminAccess, createAndAnalyze, isGameFinished, listGameSheets } from "@/lib/game-sheet/admin-sheets";
import { MAX_UPLOAD_BYTES, sniffImageMime } from "@/lib/game-sheet/image";
import { jsonError, loadGameForAccess } from "@/lib/game-sheet/service";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ eventId: string }> };

// GET /api/liga/admin/games/[eventId]/sheets — todas as folhas do jogo, com pontuação e a melhor
export async function GET(_req: Request, { params }: Params) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const access = adminAccess(auth.supabase, auth.user);
  const { eventId } = await params;

  const game = await loadGameForAccess(access, eventId);
  if (!game) return jsonError("Jogo não encontrado", 404);

  const overview = await listGameSheets(access, await createAdminClient(), game);
  const res = NextResponse.json(overview);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

// POST /api/liga/admin/games/[eventId]/sheets — carregar folha melhorada (jogo terminado) e analisá-la
export async function POST(req: Request, { params }: Params) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const access = adminAccess(auth.supabase, auth.user);
  const { eventId } = await params;

  if (!process.env.DEEPSEEK_API_KEY) return jsonError("Leitura automática indisponível (DEEPSEEK_API_KEY não configurada)", 503);

  const game = await loadGameForAccess(access, eventId);
  if (!game) return jsonError("Jogo não encontrado", 404);
  if (!(await isGameFinished(access.supabase, game))) {
    return jsonError("Só é possível carregar folhas melhoradas de jogos já realizados", 409);
  }

  let form: FormData;
  try { form = await req.formData(); } catch { return jsonError("Payload inválido", 400); }
  const file = form.get("photo");
  if (!(file instanceof File)) return jsonError("Campo 'photo' em falta", 400);
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return jsonError(`Ficheiro vazio ou demasiado grande (máx. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`, 400);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(buffer);
  if (!mime) return jsonError("Formato não suportado. Use JPEG, PNG ou WebP.", 400);

  const out = await createAndAnalyze(access, await createAdminClient(), game, buffer, mime);
  if (!out.ok) return jsonError(out.error, out.status);
  return NextResponse.json(out, { status: out.skipped ? 200 : 201 });
}
