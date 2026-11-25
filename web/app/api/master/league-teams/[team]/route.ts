import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/master/league-teams/t-<id da equipa da Liga INATEL> | c-<id do clube de outra liga>?days=30
// Devolve a equipa/clube e as analytics do site da Liga (só equipas INATEL). As analytics da app de gestão
// do clube vêm de /api/analytics/dashboard?club=<id>.
export async function GET(req: NextRequest, { params }: { params: Promise<{ team: string }> }) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { admin } = m;

  const { team: key } = await params;
  const kind = key.slice(0, 2);
  const id = key.slice(2);
  if ((kind !== "t-" && kind !== "c-") || !UUID.test(id)) return NextResponse.json({ error: "Equipa inválida" }, { status: 400 });
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30") || 30));

  if (kind === "c-") {
    const { data: club } = await admin.from("clubs").select("id, name, active").eq("id", id).maybeSingle();
    if (!club) return NextResponse.json({ error: "Clube não encontrado" }, { status: 404 });
    return NextResponse.json({ name: club.name, sigla: null, club, site: null, site_error: null });
  }

  const [{ data: team }, { data: club }] = await Promise.all([
    admin.from("league_teams").select("id, name, sigla").eq("id", id).maybeSingle(),
    admin.from("clubs").select("id, name, active").eq("league_team_id", id).is("league_url", null).maybeSingle(),
  ]);
  if (!team) return NextResponse.json({ error: "Equipa não encontrada" }, { status: 404 });

  const { data: site, error } = await admin.rpc("liga_team_analytics", { p_team: id, p_days: days });
  return NextResponse.json({
    name: team.name, sigla: team.sigla ?? null, club: club ?? null,
    site: error ? null : site, site_error: error?.message ?? null,
  });
}
