import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

export const dynamic = "force-dynamic";

type UsageUser = { user_id: string; events: number; last_seen: string };

// GET /api/master/overview?days=30 — visão global da plataforma (só Master Admin):
// totais, utilização por clube e resumo por liga. Usa o cliente SEM isolamento por clube.
export async function GET(req: NextRequest) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { admin } = m;

  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30") || 30));

  const [clubsRes, membersRes, teamsRes, usageRes, pendingRes] = await Promise.all([
    admin.from("clubs").select("id, name, slug, active, league_team_id, league_name, league_url").order("name"),
    admin.from("club_members").select("club_id, user_id, role, active"),
    admin.from("league_teams").select("id, name"),
    admin.rpc("analytics_usage_summary", { p_days: days }),
    admin.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pendente"),
  ]);
  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 });
  if (usageRes.error) return NextResponse.json({ error: usageRes.error.message }, { status: 500 });

  const clubs = clubsRes.data ?? [];
  const members = (membersRes.data ?? []).filter((r) => r.active);
  const teams = teamsRes.data ?? [];
  const usage = (usageRes.data as { total_events: number; active_week: number; users: UsageUser[] }).users ?? [];
  const usageByUser = new Map(usage.map((u) => [u.user_id, u]));

  const perClub = clubs.map((c) => {
    const ids = [...new Set(members.filter((r) => r.club_id === c.id).map((r) => r.user_id as string))];
    let events = 0, activeUsers = 0, lastSeen: string | null = null;
    for (const id of ids) {
      const u = usageByUser.get(id);
      if (!u) continue;
      events += u.events; activeUsers += 1;
      if (!lastSeen || u.last_seen > lastSeen) lastSeen = u.last_seen;
    }
    const inatelTeam = c.league_team_id ? teams.find((t) => t.id === c.league_team_id)?.name ?? null : null;
    return {
      id: c.id as string, name: c.name as string, active: c.active as boolean,
      league: c.league_url ? (c.league_name?.trim() || "Outra liga") : inatelTeam ? "Liga INATEL" : null,
      members: ids.length, active_users: activeUsers, events, last_seen: lastSeen,
    };
  });

  // Resumo por liga: nº de clubes, ativos e utilizadores. Para a Liga INATEL, também nº de equipas e as sem clube.
  const leagues = new Map<string, { name: string; clubs: number; active_clubs: number; members: number; teams?: number; teams_without_club?: number }>();
  for (const c of perClub) {
    if (!c.league) continue;
    const l = leagues.get(c.league) ?? { name: c.league, clubs: 0, active_clubs: 0, members: 0 };
    l.clubs += 1; if (c.active) l.active_clubs += 1; l.members += c.members;
    leagues.set(c.league, l);
  }
  const inatel = leagues.get("Liga INATEL") ?? { name: "Liga INATEL", clubs: 0, active_clubs: 0, members: 0 };
  inatel.teams = teams.length;
  inatel.teams_without_club = teams.length - clubs.filter((c) => c.league_team_id).length;
  leagues.set("Liga INATEL", inatel);

  return NextResponse.json({
    period_days: days,
    totals: {
      clubs: clubs.length,
      active_clubs: clubs.filter((c) => c.active).length,
      users: new Set(members.map((r) => r.user_id)).size,
      events: (usageRes.data as { total_events: number }).total_events ?? 0,
      active_week: (usageRes.data as { active_week: number }).active_week ?? 0,
      pending_requests: pendingRes.count ?? 0,
    },
    clubs: perClub.sort((a, b) => b.events - a.events),
    leagues: [...leagues.values()],
  });
}
