import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster, slugify } from "@/lib/auth/master";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// GET /api/master/clubs — todos os clubes com nº de membros e equipa da Liga associada
export async function GET() {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { admin } = m;

  const [{ data: clubs, error }, { data: members }, { data: teams }] = await Promise.all([
    admin.from("clubs").select("id, name, slug, active, league_team_id, created_at").order("name"),
    admin.from("club_members").select("club_id, active"),
    admin.from("league_teams").select("id, name").order("name"),
  ]);
  if (error) return fail(error.message, 500);

  const count = new Map<string, number>();
  for (const r of members ?? []) if (r.active) count.set(r.club_id, (count.get(r.club_id) ?? 0) + 1);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const used = new Set((clubs ?? []).map((c) => c.league_team_id).filter(Boolean));

  return NextResponse.json({
    clubs: (clubs ?? []).map((c) => ({
      ...c,
      members: count.get(c.id) ?? 0,
      league_team_name: c.league_team_id ? teamName.get(c.league_team_id) ?? null : null,
    })),
    free_league_teams: (teams ?? []).filter((t) => !used.has(t.id)),
  });
}

// POST /api/master/clubs { name, slug?, league_team_id? } — cria SEMPRE inativo
export async function POST(req: NextRequest) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { admin } = m;

  let body: { name?: string; slug?: string; league_team_id?: string | null };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const name = body.name?.trim();
  if (!name || name.length < 2) return fail("Nome do clube obrigatório");
  const slug = slugify(body.slug?.trim() || name);
  if (!slug) return fail("Slug inválido");

  const { data: club, error } = await admin
    .from("clubs")
    .insert({ name, slug, league_team_id: body.league_team_id || null, active: false })
    .select("id, name, slug, active, league_team_id, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return fail("Já existe um clube com este slug ou equipa da Liga", 409);
    return fail(error.message, 500);
  }
  // Definições (branding) próprias do clube, neutras e não públicas
  await admin.from("club_settings").insert({ id: club.slug, club_id: club.id, club_name: club.name, slug: club.slug, is_public: false });
  return NextResponse.json({ club: { ...club, members: 0, league_team_name: null } }, { status: 201 });
}
