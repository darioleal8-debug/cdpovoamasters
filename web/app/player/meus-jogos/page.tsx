import { todayInClubTz } from "@/lib/time/club-time";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MeusJogosView, type ProcessedGame } from "./meus-jogos-view";

export const metadata = { title: "Os Meus Jogos" };

// ─── Parse da jornada a partir do campo description (JSON) ───

function parseMeta(description: string | null) {
  if (!description) return null;
  try {
    const m = JSON.parse(description) as {
      jornada?: unknown; volta?: unknown;
      home_team?: unknown; away_team?: unknown;
      pavilion?: unknown; locality?: unknown;
    };
    if (!m.jornada || !m.home_team || !m.away_team) return null;
    return {
      jornada:   Number(m.jornada),
      volta:     Number(m.volta ?? 1),
      home_team: String(m.home_team),
      away_team: String(m.away_team),
      pavilion:  m.pavilion  ? String(m.pavilion)  : null,
      locality:  m.locality  ? String(m.locality)  : null,
    };
  } catch { return null; }
}

// ─── Página ──────────────────────────────────────────────────

export default async function MeusJogosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const params = await searchParams;
  const vista = params.vista === "liga" ? "liga" : "agenda";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayInClubTz();

  // Época ativa
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id")
    .eq("status", "ativa")
    .maybeSingle();

  // Perfil de jogador na época ativa
  let playerId: string | null = null;
  if (activeSeason?.id) {
    const { data } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", user.id)
      .eq("season_id", activeSeason.id)
      .maybeSingle();
    playerId = data?.id ?? null;
  }

  // Todos os jogos da liga (com description para parsear jornada)
  const { data: eventsRaw } = activeSeason?.id
    ? await supabase
        .from("events")
        .select("id, title, event_date, event_time, location, is_club_game, description")
        .eq("type", "jogo")
        .eq("season_id", activeSeason.id)
        .is("deleted_at", null)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
    : { data: [] as RawEvent[] };

  type RawEvent = {
    id: string; title: string; event_date: string; event_time: string;
    location: string; is_club_game: boolean; description: string | null;
  };
  const rawList = (eventsRaw ?? []) as RawEvent[];

  // Enriquecer com metadata de jornada
  const enriched = rawList.map((e) => {
    const meta = parseMeta(e.description);
    return {
      id:            e.id,
      title:         e.title,
      event_date:    e.event_date,
      event_time:    e.event_time,
      location:      e.location,
      is_club_game:  e.is_club_game,
      jornada:       meta?.jornada  ?? null,
      volta:         meta?.volta    ?? 1,
      home_team:     meta?.home_team ?? null,
      away_team:     meta?.away_team ?? null,
      pavilion:      meta?.pavilion  ?? null,
      locality:      meta?.locality  ?? null,
    };
  });

  // Calcular syntheticJornada (volta 1 = J1, J2…; volta 2 = continua a partir do máximo da volta 1)
  const maxPerVolta = new Map<number, number>();
  for (const g of enriched) {
    if (g.jornada) {
      const prev = maxPerVolta.get(g.volta) ?? 0;
      if (g.jornada > prev) maxPerVolta.set(g.volta, g.jornada);
    }
  }
  const offsets = new Map<number, number>();
  let acc = 0;
  for (const v of [...maxPerVolta.keys()].sort((a, b) => a - b)) {
    offsets.set(v, acc);
    acc += maxPerVolta.get(v) ?? 0;
  }

  const gameIds = enriched.map((g) => g.id);

  // Resultados de jogos terminados
  type SessionRow = { event_id: string; home_score: number; away_score: number };
  const { data: sessionRows } = gameIds.length > 0
    ? await supabase
        .from("game_sessions")
        .select("event_id, home_score, away_score, status")
        .in("event_id", gameIds)
        .eq("status", "finished")
    : { data: [] as SessionRow[] };
  const resultsByGame = new Map<string, { home: number; away: number }>(
    ((sessionRows ?? []) as SessionRow[]).map((s) => [s.event_id, { home: s.home_score, away: s.away_score }])
  );

  // Disponibilidade do jogador nesta época
  const availabilityByGame = new Map<string, "yes" | "no">();
  if (playerId && gameIds.length > 0) {
    const { data: availRows } = await supabase
      .from("game_availability")
      .select("game_id, status")
      .eq("player_id", playerId)
      .in("game_id", gameIds);
    type AvailRow = { game_id: string; status: string };
    for (const row of ((availRows ?? []) as AvailRow[])) {
      if (row.status === "available")   availabilityByGame.set(row.game_id, "yes");
      if (row.status === "unavailable") availabilityByGame.set(row.game_id, "no");
    }
  }

  // Montar objeto final
  const games: ProcessedGame[] = enriched.map((g) => ({
    ...g,
    syntheticJornada: g.jornada ? (offsets.get(g.volta) ?? 0) + g.jornada : null,
    result:           resultsByGame.get(g.id) ?? null,
    isCalledUp:       false, // not used in current view
    myAvailability:   availabilityByGame.get(g.id) ?? null,
    isPast:           g.event_date < today,
  }));

  return (
    <MeusJogosView
      games={games}
      initialVista={vista}
      playerId={playerId}
      today={today}
    />
  );
}
