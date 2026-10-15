import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const admin = await createAdminClient();

    // 1. Clube público
    const { data: club } = await admin
      .from("club_settings")
      .select("id, club_name, logo_url, slug")
      .eq("slug", slug)
      .eq("is_public", true)
      .single();

    if (!club) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2. Época activa
    const { data: season } = await admin
      .from("seasons")
      .select("id, name, year")
      .eq("status", "ativa")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Plantel
    type PlayerRow = { id: string; user_id: string; number: number | null; position: string | null; photo_url: string | null };
    type UserRow   = { id: string; name: string };

    let players: Array<{ id: string; name: string; number: number | null; position: string | null; photo_url: string | null }> = [];

    if (season) {
      const { data: playerRows } = await admin
        .from("players")
        .select("id, user_id, number, position, photo_url")
        .eq("season_id", season.id) as { data: PlayerRow[] | null };

      if (playerRows?.length) {
        const userIds = [...new Set(playerRows.map((p) => p.user_id).filter(Boolean))];
        const { data: userRows } = await admin
          .from("users")
          .select("id, name")
          .in("id", userIds) as { data: UserRow[] | null };

        const userMap = new Map((userRows ?? []).map((u) => [u.id, u.name]));

        players = (playerRows ?? [])
          .map((p) => ({
            id: p.id,
            name: userMap.get(p.user_id) ?? "Jogador",
            number: p.number,
            position: p.position,
            photo_url: p.photo_url,
          }))
          .sort((a, b) => {
            if (a.number !== null && b.number !== null) return a.number - b.number;
            if (a.number === null) return 1;
            if (b.number === null) return -1;
            return a.name.localeCompare(b.name, "pt");
          });
      }
    }

    // 4. Calendário (apenas jogos, ordenado por data desc)
    type EventRow = { id: string; event_date: string; event_time: string | null; opponent: string | null; location: string | null; game_type: string | null };
    type SessionRow = { event_id: string; home_score: number | null; away_score: number | null; status: string | null; is_home_game: boolean | null };

    let games: Array<{
      id: string; event_date: string; event_time: string | null;
      opponent: string | null; location: string | null; game_type: string | null;
      is_home_game: boolean | null; home_score: number | null; away_score: number | null; status: string | null;
    }> = [];

    if (season) {
      const { data: eventRows } = await admin
        .from("events")
        .select("id, event_date, event_time, opponent, location, game_type")
        .eq("season_id", season.id)
        .eq("type", "jogo")
        .order("event_date", { ascending: false }) as { data: EventRow[] | null };

      if (eventRows?.length) {
        const eventIds = eventRows.map((e) => e.id);
        const { data: sessionRows } = await admin
          .from("game_sessions")
          .select("event_id, home_score, away_score, status, is_home_game")
          .in("event_id", eventIds) as { data: SessionRow[] | null };

        const sessionMap = new Map((sessionRows ?? []).map((s) => [s.event_id, s]));

        games = eventRows.map((e) => {
          const s = sessionMap.get(e.id);
          return {
            id: e.id,
            event_date: e.event_date,
            event_time: e.event_time,
            opponent: e.opponent,
            location: e.location,
            game_type: e.game_type,
            is_home_game: s?.is_home_game ?? null,
            home_score: s?.home_score ?? null,
            away_score: s?.away_score ?? null,
            status: s?.status ?? null,
          };
        });
      }
    }

    // 5. Registo W/L
    const finished = games.filter((g) => g.status === "finished");
    const wins   = finished.filter((g) => (g.home_score ?? 0) > (g.away_score ?? 0)).length;
    const losses = finished.filter((g) => (g.home_score ?? 0) < (g.away_score ?? 0)).length;

    return NextResponse.json(
      { club, season, players, games, record: { wins, losses, played: finished.length } },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
