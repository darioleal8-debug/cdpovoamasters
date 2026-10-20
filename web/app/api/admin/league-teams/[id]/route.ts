import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json() as Partial<{
    name: string;
    home_pavilion: string | null;
    locality: string | null;
    short_name: string | null;
    sigla: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    ccd_number: string | null;
    logo_url: string | null;
  }>;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    update.name = body.name.trim();
    update.normalized_name = body.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    update.slug = (update.normalized_name as string).replace(/\s+/g, "-");
  }
  for (const k of ["home_pavilion","locality","short_name","sigla","contact_name","contact_phone","ccd_number","logo_url"] as const) {
    if (k in body) update[k] = (body[k] as string | null)?.trim() || null;
  }

  const { data, error } = await auth.supabase
    .from("league_teams")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Não apagar equipa que seja a nossa (is_our_team = true)
  const { data: team } = await auth.supabase
    .from("league_teams")
    .select("is_our_team, name")
    .eq("id", id)
    .single();

  if (team?.is_our_team) {
    return NextResponse.json({ error: "Não é possível apagar a equipa do clube." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("league_teams")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
