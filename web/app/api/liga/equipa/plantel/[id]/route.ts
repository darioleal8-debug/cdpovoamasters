import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeLeagueDelegate } from "@/lib/auth/liga-delegate-guard";
import { loadHoophubRoster, parsePlayerFields } from "@/lib/liga/roster";
import { createAdminClient } from "@/lib/supabase/server";
import { storePlayerPhoto, removePlayerPhoto } from "@/lib/liga/roster-photo";
import { isUuid } from "@/lib/game-sheet/service";

export const runtime = "nodejs";
async function managedByHoophub(teamId: string): Promise<boolean> {
  try { return (await loadHoophubRoster(await createAdminClient(), teamId)).length > 0; } catch { return false; }
}
const HOOPHUB_MANAGED = { error: "O plantel desta equipa vem da app de gestão HoopHub — altere-o lá e fica atualizado aqui." };
type Params = { params: Promise<{ id: string }> };

async function loadOwn(auth: Extract<Awaited<ReturnType<typeof authorizeLeagueDelegate>>, { ok: true }>, id: string) {
  const { data } = await auth.supabase.from("league_team_players")
    .select("id, team_id, photo_path, is_active").eq("id", id).eq("team_id", auth.teamId).maybeSingle();
  return data as { id: string; team_id: string; photo_path: string | null; is_active: boolean } | null;
}

/** Editar jogador (multipart: first_name?, last_name?, number?, photo?, remove_photo?). */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Jogador inválido" }, { status: 400 });
  if (await managedByHoophub(auth.teamId)) return NextResponse.json(HOOPHUB_MANAGED, { status: 409 });
  const row = await loadOwn(auth, id);
  if (!row || !row.is_active) return NextResponse.json({ error: "Jogador não encontrado no seu plantel" }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  const opt = (k: string) => (form.has(k) ? form.get(k) : undefined);
  const parsed = parsePlayerFields({ first_name: opt("first_name"), last_name: opt("last_name"), number: opt("number") }, true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const update: Record<string, unknown> = { ...parsed.value, updated_at: new Date().toISOString() };
  let newPhoto: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const stored = await storePlayerPhoto(auth.supabase, auth.teamId, photo);
    if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: 400 });
    newPhoto = stored.path;
    update.photo_path = newPhoto;
  } else if (form.get("remove_photo") === "1") {
    update.photo_path = null;
  }

  const { error } = await auth.supabase.from("league_team_players").update(update).eq("id", id).eq("team_id", auth.teamId);
  if (error) {
    await removePlayerPhoto(auth.supabase, newPhoto);
    if (error.code === "23505") return NextResponse.json({ error: `Já existe um jogador com o número ${parsed.value.number} no plantel.` }, { status: 409 });
    return NextResponse.json({ error: `Erro ao guardar: ${error.message}` }, { status: 500 });
  }
  if ("photo_path" in update && row.photo_path) await removePlayerPhoto(auth.supabase, row.photo_path);
  revalidatePath("/liga-inatel/equipas", "layout");
  return NextResponse.json({ ok: true });
}

/**
 * Retirar jogador do plantel atual. Fica inativo (não aparece ao público nem na validação),
 * preservando o histórico; a fotografia é apagada.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Jogador inválido" }, { status: 400 });
  if (await managedByHoophub(auth.teamId)) return NextResponse.json(HOOPHUB_MANAGED, { status: 409 });
  const row = await loadOwn(auth, id);
  if (!row) return NextResponse.json({ error: "Jogador não encontrado no seu plantel" }, { status: 404 });
  const { error } = await auth.supabase.from("league_team_players")
    .update({ is_active: false, photo_path: null, updated_at: new Date().toISOString() }).eq("id", id).eq("team_id", auth.teamId);
  if (error) return NextResponse.json({ error: `Erro ao remover: ${error.message}` }, { status: 500 });
  await removePlayerPhoto(auth.supabase, row.photo_path);
  revalidatePath("/liga-inatel/equipas", "layout");
  return NextResponse.json({ ok: true });
}
