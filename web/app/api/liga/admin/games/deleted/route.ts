import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";

export async function GET() {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = await createAdminClient();

  const { data: competition } = await adminClient
    .from("competitions")
    .select("competition_key, season_id")
    .eq("slug", "liga-inatel")
    .single();

  if (!competition?.season_id) {
    return NextResponse.json({ games: [] });
  }

  const [eventsRes, ourTeamRes] = await Promise.all([
    adminClient
      .from("events")
      .select("id, event_date, event_time, location, description, opponent, deleted_at")
      .eq("type", "jogo")
      .eq("competition", competition.competition_key ?? "Liga")
      .eq("season_id", competition.season_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    adminClient.from("league_teams").select("name").eq("is_our_team", true).single(),
  ]);

  const ourTeam = ourTeamRes.data?.name ?? "";

  const games = (eventsRes.data ?? []).map((e: {
    id: string; event_date: string; event_time: string | null;
    location: string | null; description: string | null; opponent: string | null;
    deleted_at: string;
  }) => {
    const meta = parseGameMeta(e.description ?? null);
    return {
      id: e.id,
      event_date: e.event_date,
      event_time: e.event_time,
      location: e.location,
      home_team: meta?.home_team ?? ourTeam,
      away_team: meta?.away_team ?? (e.opponent ?? "Adversário"),
      jornada: meta?.jornada ?? null,
      deleted_at: e.deleted_at,
    };
  });

  return NextResponse.json({ games });
}
