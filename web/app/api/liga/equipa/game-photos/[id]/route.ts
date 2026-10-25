import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// DELETE /api/liga/equipa/game-photos/[id]
// Apaga uma foto de jogo. Só o uploader pode apagar.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const admin = await createAdminClient();

  const { data: photo } = await admin
    .from("game_photos")
    .select("id, storage_path, uploaded_by")
    .eq("id", id)
    .maybeSingle();

  if (!photo) return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });

  if (photo.uploaded_by !== user.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await admin.storage.from("game-photos").remove([photo.storage_path]);
  await admin.from("game_photos").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
