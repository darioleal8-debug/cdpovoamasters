import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { getCompetitionBySlug, getTeamLogos } from "@/lib/competitions-data";
import type { Competition } from "@/types/competitions";

/** Slug da competição "Taça da Liga INATEL" (independente da Liga INATEL). */
export const CUP_SLUG = "taca-liga-inatel";
export const CUP_NAME = "Taça da Liga INATEL";
/** Valor de events.competition dos jogos da Taça. */
export const CUP_KEY = "Taça";

export interface CupTeam {
  name: string;
  /** "Vencedor Taça N": ainda por definir */
  placeholder: boolean;
  logoUrl: string | null;
}

export interface CupGame {
  id: string;
  num: number;
  round: number;
  roundName: string;
  date: string;          // YYYY-MM-DD
  time: string | null;   // HH:MM (null = por definir)
  dateNote: string | null;
  dateTbc: boolean;
  venue: string | null;
  locality: string | null;
  home: CupTeam;
  away: CupTeam;
  /** nº do jogo da Taça de onde vem cada equipa (null = equipa fixa / isenta) */
  homeSource: number | null;
  awaySource: number | null;
  result: { home: number; away: number } | null;
  winner: "home" | "away" | null;
  status: "scheduled" | "live" | "finished";
  liveUrl: string | null;
  isOurGame: boolean;
}

export interface CupRound {
  round: number;
  name: string;
  short: string;
  games: CupGame[];
}

export interface CupBracket {
  competition: Competition | null;
  rounds: CupRound[];
  champion: CupTeam | null;
}

const ROUND_SHORT: Record<number, string> = {
  1: "1ª Eliminatória",
  2: "Quartos de final",
  3: "Meias-finais",
  4: "Final",
};

interface RawMeta {
  taca_num?: number;
  round?: number;
  round_name?: string;
  home_team?: string;
  away_team?: string;
  pavilion?: string;
  locality?: string;
  home_source?: { taca_num: number };
  away_source?: { taca_num: number };
  date_tbc?: boolean;
  time_tbc?: boolean;
  date_note?: string;
}

const isPlaceholderName = (n: string) => /^Vencedor Taça \d+$/i.test(n.trim());

export async function getCupBracket(): Promise<CupBracket> {
  const competition = await getCompetitionBySlug(CUP_SLUG);
  if (!competition?.season_id) return { competition: null, rounds: [], champion: null };

  const db = await createUnscopedAdminClient();
  const [eventsRes, resultsRes, sessionsRes, logos] = await Promise.all([
    db.from("events")
      .select("id, event_date, event_time, location, description")
      .eq("type", "jogo")
      .eq("competition", competition.competition_key ?? CUP_KEY)
      .eq("season_id", competition.season_id)
      .is("deleted_at", null)
      .order("event_date", { ascending: true }),
    db.from("league_game_results")
      .select("event_id, home_score, away_score")
      .eq("competition_id", competition.id),
    db.from("game_sessions").select("id, event_id").eq("status", "live"),
    getTeamLogos(),
  ]);

  const resultByEvent = new Map(
    (resultsRes.data ?? []).map((r) => [r.event_id as string, r as { home_score: number; away_score: number }])
  );
  const liveByEvent = new Map((sessionsRes.data ?? []).map((s) => [s.event_id as string, s.id as string]));

  const team = (name: string): CupTeam => ({
    name,
    placeholder: isPlaceholderName(name),
    logoUrl: logos[name] ?? null,
  });

  const games: CupGame[] = [];
  for (const e of eventsRes.data ?? []) {
    let m: RawMeta;
    try { m = JSON.parse(e.description as string) as RawMeta; } catch { continue; }
    if (!m.taca_num || !m.round || !m.home_team || !m.away_team) continue;

    const res = resultByEvent.get(e.id as string) ?? null;
    const live = liveByEvent.get(e.id as string) ?? null;
    const winner = res
      ? res.home_score > res.away_score ? "home" : res.home_score < res.away_score ? "away" : null
      : null;

    games.push({
      id: e.id as string,
      num: m.taca_num,
      round: m.round,
      roundName: m.round_name ?? ROUND_SHORT[m.round] ?? `Ronda ${m.round}`,
      date: e.event_date as string,
      time: m.time_tbc ? null : String(e.event_time ?? "").slice(0, 5) || null,
      dateNote: m.date_note ?? null,
      dateTbc: m.date_tbc === true,
      venue: m.pavilion ?? null,
      locality: m.locality ?? null,
      home: team(m.home_team),
      away: team(m.away_team),
      homeSource: m.home_source?.taca_num ?? null,
      awaySource: m.away_source?.taca_num ?? null,
      result: res ? { home: res.home_score, away: res.away_score } : null,
      winner,
      status: live ? "live" : res ? "finished" : "scheduled",
      liveUrl: live ? `/live/${live}` : null,
      isOurGame: /póvoa/i.test(m.home_team) || /póvoa/i.test(m.away_team),
    });
  }

  const rounds: CupRound[] = [];
  for (const r of [...new Set(games.map((g) => g.round))].sort((a, b) => a - b)) {
    const list = games.filter((g) => g.round === r).sort((a, b) => a.num - b.num);
    rounds.push({ round: r, name: list[0].roundName, short: ROUND_SHORT[r] ?? list[0].roundName, games: list });
  }

  const final = rounds.find((r) => r.round === Math.max(...rounds.map((x) => x.round)))?.games[0];
  const champion =
    final && final.winner ? (final.winner === "home" ? final.home : final.away) : null;

  return { competition, rounds, champion };
}
