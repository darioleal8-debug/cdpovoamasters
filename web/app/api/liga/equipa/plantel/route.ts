import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeLeagueDelegate } from "@/lib/auth/liga-delegate-guard";
import { loadHoophubRoster, loadTeamRoster, parsePlayerFields } from "@/lib/liga/roster";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { storePlayerPhoto, removePlayerPhoto } from "@/lib/liga/roster-photo";

export const runtime = "nodejs";

const HOOPHUB_MANAGED_MSG = "O plantel desta equipa vem da app de gestão HoopHub — altere-o lá e fica atualizado aqui.";
async function isManagedByHoophub(teamId: string): Promise<boolean> {
  try { return (await loadHoophubRoster(await createUnscopedAdminClient(), teamId)).length > 0; } catch { return false; }
}

/** Plantel da equipa do delegado. */
export async function GET() {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;
  const admin = await createUnscopedAdminClient();
  const players = await loadTeamRoster(auth.supabase, auth.teamId, admin);
  const managedBy = players.some((p) => p.source === "hoophub") ? "hoophub" : null;
  return NextResponse.json({ team: { id: auth.teamId, name: auth.teamName }, players, managedBy });
}

/** Adicionar jogador (multipart: first_name, last_name, number, photo?). Sessão do delegado + RLS. */
export async function POST(req: Request) {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;
  if (await isManagedByHoophub(auth.teamId)) return NextResponse.json({ error: HOOPHUB_MANAGED_MSG }, { status: 409 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  const parsed = parsePlayerFields({ first_name: form.get("first_name"), last_name: form.get("last_name"), number: form.get("number") });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  let photoPath: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const stored = await storePlayerPhoto(auth.supabase, auth.teamId, photo);
    if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: 400 });
    photoPath = stored.path;
  }

  const { data, error } = await auth.supabase.from("league_team_players").insert({
    team_id: auth.teamId, ...parsed.value, photo_path: photoPath, created_by: auth.user.id,
  }).select("id").single();
  if (error) {
    await removePlayerPhoto(auth.supabase, photoPath);
    if (error.code === "23505") return NextResponse.json({ error: `Já existe um jogador com o número ${parsed.value.number} no plantel.` }, { status: 409 });
    return NextResponse.json({ error: `Erro ao guardar: ${error.message}` }, { status: 500 });
  }
  revalidatePath("/liga-inatel/equipas", "layout");
  return NextResponse.json({ ok: true, id: data.id });
}
