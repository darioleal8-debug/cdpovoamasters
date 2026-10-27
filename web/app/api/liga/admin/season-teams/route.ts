import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";

// GET /api/liga/admin/season-teams
// Lista todas as equipas inscritas na competição com status active e contagem de jogos.
export async function GET() {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = await createAdminClient();

  const { data: comp } = await adminClient
    .from("competitions")
    .select("id, season_id, competition_key")
    .eq("slug", "liga-inatel")
    .single();

  if (!comp) return NextResponse.json({ error: "Competição não encontrada" }, { status: 404 });

  const [stRes, teamsRes, eventsRes] = await Promise.all([
    adminClient
      .from("season_teams")
      .select("team_id, active, series")
      .eq("competition_id", comp.id),

    adminClient
      .from("league_teams")
      .select("id, name, logo_url")
      .eq("is_placeholder", false)
      .order("name"),

    adminClient
      .from("events")
      .select("description")
      .eq("type", "jogo")
      .eq("competition", comp.competition_key ?? "Liga")
      .eq("season_id", comp.season_id)
      .is("deleted_at", null),
  ]);

  const stMap = new Map(
    (stRes.data ?? []).map((r: { team_id: string; active: boolean }) => [r.team_id, r.active])
  );
  const seriesMap = new Map(
    (stRes.data ?? []).map((r: { team_id: string; series: string | null }) => [r.team_id, r.series ?? null])
  );

  // Contar jogos por nome de equipa (a partir dos eventos)
  const gamesByName = new Map<string, number>();
  for (const e of eventsRes.data ?? []) {
    const meta = parseGameMeta(e.description);
    if (meta?.home_team) gamesByName.set(meta.home_team, (gamesByName.get(meta.home_team) ?? 0) + 1);
    if (meta?.away_team) gamesByName.set(meta.away_team, (gamesByName.get(meta.away_team) ?? 0) + 1);
  }

  const teams = (teamsRes.data ?? []).map((t: { id: string; name: string; logo_url: string | null }) => ({
    team_id: t.id,
    name: t.name,
    logo_url: t.logo_url ?? null,
    active: stMap.get(t.id) ?? false,
    game_count: gamesByName.get(t.name) ?? 0,
    in_season: stMap.has(t.id),
    series: seriesMap.get(t.id) ?? null,
  }));

  return NextResponse.json({ teams, competition_id: comp.id });
}
