import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { adminAccess, createAndAnalyze, isGameFinished, listGameSheets } from "@/lib/game-sheet/admin-sheets";
import { MAX_UPLOAD_BYTES, sniffImageMime } from "@/lib/game-sheet/image";
import { jsonError, isUuid, loadGameForAccess } from "@/lib/game-sheet/service";
import { resolveSheetLocation } from "@/lib/liga/sheet-location";

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

// DELETE /api/liga/admin/games/[eventId]/sheets
// Body: { kind: "import" | "submission", id: string, reason?: string }
export async function DELETE(req: Request, { params }: Params) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;
  const access = adminAccess(auth.supabase, auth.user);
  const { eventId } = await params;

  const game = await loadGameForAccess(access, eventId);
  if (!game) return jsonError("Jogo não encontrado", 404);

  let body: unknown;
  try { body = await req.json(); } catch { return jsonError("Payload inválido", 400); }
  if (typeof body !== "object" || body === null) return jsonError("Payload inválido", 400);
  const { kind, id, reason } = body as Record<string, unknown>;
  if (kind !== "import" && kind !== "submission") return jsonError("kind deve ser 'import' ou 'submission'", 400);
  if (!isUuid(id)) return jsonError("id inválido", 400);
  const motivo = typeof reason === "string" && reason.trim() ? reason.trim() : "Apagado pelo admin";

  // Para submission, precisamos do photo_url antes de anular (a função SQL anula-o)
  let subPhotoUrl: string | null = null;
  if (kind === "submission") {
    const svc = createServiceClient();
    const { data: sub } = await svc.from("result_submissions")
      .select("id, event_id, photo_url")
      .eq("id", id)
      .maybeSingle();
    if (!sub || sub.event_id !== game.id) return jsonError("Submissão não encontrada neste jogo", 404);
    subPhotoUrl = sub.photo_url as string | null;
  }

  const { data: rpcData, error: rpcErr } = await auth.supabase.rpc("liga_delete_game_sheet", {
    p_kind: kind,
    p_id: id,
    p_reason: motivo,
  });
  if (rpcErr) {
    const status = rpcErr.code === "42501" ? 403 : rpcErr.code === "55000" ? 409 : rpcErr.code === "P0002" ? 404 : 500;
    return jsonError(rpcErr.message, status);
  }

  // A função RPC faz validação, anula FKs e regista auditoria.
  // O DELETE da linha e a remoção do Storage são feitos aqui com service role.
  const result = rpcData as { storage_path: string | null; other_refs: number } | null;
  const svc = createServiceClient();

  if (kind === "import") {
    const { error: delErr } = await svc.from("game_sheet_imports").delete().eq("id", id);
    if (delErr) console.error(`[delete-sheet] delete import ${id}: ${delErr.message}`);

    if (result?.storage_path && (result.other_refs ?? 1) === 0) {
      const { error: rmErr } = await svc.storage.from("folhas-jogo").remove([result.storage_path]);
      if (rmErr) console.error(`[delete-sheet] remove ${result.storage_path}: ${rmErr.message}`);
    }
  } else if (kind === "submission" && subPhotoUrl) {
    const loc = resolveSheetLocation(subPhotoUrl);
    if (loc) {
      const { data: refs } = await svc.from("game_sheet_imports")
        .select("id").eq("image_path", loc.path).limit(1);
      if (!refs?.length) {
        const { error: rmErr } = await svc.storage.from(loc.bucket).remove([loc.path]);
        if (rmErr) console.error(`[delete-sheet] remove sub ${loc.bucket}/${loc.path}: ${rmErr.message}`);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
