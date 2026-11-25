import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

export const dynamic = "force-dynamic";

export const INATEL = "Liga INATEL";

type UsageUser = { user_id: string; events: number; last_seen: string };
type SiteRow = { team_id: string; delegate_views: number; active_delegates: number; last_seen: string | null; team_page_views: number };

// GET /api/master/leagues/<nome da liga>?days=30 — equipas da liga com as suas analytics (só Master Admin).
// Liga INATEL: todas as equipas (uso da app de gestão, se tiverem clube, + atividade no site da Liga).
// Outra liga: os clubes associados a essa liga (uso da app de gestão).
export async function GET(req: NextRequest, { params }: { params: Promise<{ league: string }> }) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { admin } = m;

  const { league: raw } = await params;
  let league = raw;
  try { league = decodeURIComponent(raw); } catch { /* já decodificado */ }
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30") || 30));
  const isInatel = league === INATEL;

  const [clubsRes, membersRes, teamsRes, usageRes, siteRes] = await Promise.all([
    admin.from("clubs").select("id, name, active, league_team_id, league_name, league_url").order("name"),
    admin.from("club_members").select("club_id, user_id, active"),
    admin.from("league_teams").select("id, name, sigla, slug").order("name"),
    admin.rpc("analytics_usage_summary", { p_days: days }),
    isInatel ? admin.rpc("liga_teams_summary", { p_days: days }) : Promise.resolve({ data: null, error: null }),
  ]);
  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 });
  if (usageRes.error) return NextResponse.json({ error: usageRes.error.message }, { status: 500 });

  const members = (membersRes.data ?? []).filter((r) => r.active);
  const usage = new Map(((usageRes.data as { users: UsageUser[] }).users ?? []).map((u) => [u.user_id, u]));
  const site = new Map(((siteRes.data as SiteRow[] | null) ?? []).map((r) => [r.team_id, r]));

  const appStats = (clubId: string) => {
    const ids = [...new Set(members.filter((r) => r.club_id === clubId).map((r) => r.user_id as string))];
    let events = 0, activeUsers = 0, lastSeen: string | null = null;
    for (const id of ids) {
      const u = usage.get(id);
      if (!u) continue;
      events += u.events; activeUsers += 1;
      if (!lastSeen || u.last_seen > lastSeen) lastSeen = u.last_seen;
    }
    return { members: ids.length, active_users: activeUsers, events, last_seen: lastSeen };
  };

  type Club = { id: string; name: string; active: boolean };
  const clubs = clubsRes.data ?? [];

  const teams = isInatel
    ? (teamsRes.data ?? []).map((t) => {
        const c = clubs.find((x) => x.league_team_id === t.id && !x.league_url) as Club | undefined;
        const s = site.get(t.id as string);
        return {
          key: `t-${t.id}`, name: t.name as string, sigla: (t.sigla as string | null) ?? null,
          club: c ? { id: c.id, name: c.name, active: c.active } : null,
          app: c ? appStats(c.id) : null,
          site: { delegate_views: s?.delegate_views ?? 0, active_delegates: s?.active_delegates ?? 0, team_page_views: s?.team_page_views ?? 0, last_seen: s?.last_seen ?? null },
        };
      })
    : clubs.filter((c) => c.league_url && (c.league_name?.trim() || "Outra liga") === league).map((c) => ({
        key: `c-${c.id}`, name: c.name as string, sigla: null,
        club: { id: c.id as string, name: c.name as string, active: c.active as boolean },
        app: appStats(c.id as string), site: null,
      }));

  if (!isInatel && teams.length === 0) return NextResponse.json({ error: "Liga não encontrada" }, { status: 404 });

  return NextResponse.json({
    league, kind: isInatel ? "inatel" : "outra", period_days: days,
    site_error: isInatel && siteRes.error ? siteRes.error.message : null,
    teams,
  });
}
