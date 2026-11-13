import { NextResponse } from "next/server";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { authorizeLeagueDelegate } from "@/lib/auth/liga-delegate-guard";
import { deleteGamePhoto } from "@/lib/liga/game-photos";

// DELETE /api/liga/equipa/game-photos/[id]
// Apaga uma foto de jogo. Só o uploader pode apagar.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id } = await params;
  const admin = await createUnscopedAdminClient();

  const { data: photo } = await admin
    .from("game_photos")
    .select("id, game_id, storage_path, uploaded_by")
    .eq("id", id)
    .maybeSingle();

  if (!photo) return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });

  if (photo.uploaded_by !== user.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await deleteGamePhoto(admin, photo as { id: string; game_id: string; storage_path: string });

  return NextResponse.json({ ok: true });
}
