"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type {
  GameSession,
  PlayByPlay,
  PlayerGameStats,
  PlayerGameStatsWithUser,
  RecordPlayInput,
  PlayEventType,
  GamePeriodScore,
} from "@/types/database";
import type { PlayerWithUser } from "@/types/database";

// Pontos gerados por cada tipo de evento
const POINTS_MAP: Partial<Record<PlayEventType, number>> = {
  "2pt_made": 2,
  "3pt_made": 3,
  "ft_made": 1,
};

// Campos de player_game_stats afetados por cada evento
function statDeltaForEvent(type: PlayEventType): Partial<Record<string, number>> {
  switch (type) {
    case "2pt_made":    return { pts: 2, fg2_made: 1, fg2_att: 1 };
    case "2pt_miss":    return { fg2_att: 1 };
    case "3pt_made":    return { pts: 3, fg3_made: 1, fg3_att: 1 };
    case "3pt_miss":    return { fg3_att: 1 };
    case "ft_made":     return { pts: 1, ft_made: 1, ft_att: 1 };
    case "ft_miss":     return { ft_att: 1 };
    case "rebound_off": return { reb_off: 1 };
    case "rebound_def": return { reb_def: 1 };
    case "assist":      return { ast: 1 };
    case "steal":       return { stl: 1 };
    case "block":       return { blk: 1 };
    case "turnover":    return { tov: 1 };
    case "foul_committed": return { fouls_committed: 1 };
    case "foul_drawn":     return { fouls_drawn: 1 };
    default: return {};
  }
}

function calcEfficiency(s: Partial<PlayerGameStats>): number {
  return (
    (s.pts ?? 0) +
    (s.reb_off ?? 0) + (s.reb_def ?? 0) +
    (s.ast ?? 0) + (s.stl ?? 0) + (s.blk ?? 0) -
    (s.tov ?? 0) -
    ((s.fg2_att ?? 0) - (s.fg2_made ?? 0)) -
    ((s.fg3_att ?? 0) - (s.fg3_made ?? 0)) -
    ((s.ft_att ?? 0) - (s.ft_made ?? 0))
  );
}

export function useGameSession(eventId: string, seasonId: string) {
  const supabase = createClient();

  const [session, setSession] = useState<GameSession | null>(null);
  const [plays, setPlays] = useState<PlayByPlay[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerGameStatsWithUser[]>([]);
  const [periodScores, setPeriodScores] = useState<GamePeriodScore[]>([]);
  const [roster, setRoster] = useState<PlayerWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);

  // Carrega plantel da temporada ativa
  const loadRoster = useCallback(async () => {
    const { data } = await supabase
      .from("player_profiles")
      .select("*, user:users(id, name, email, status)")
      .eq("season_id", seasonId)
      .order("jersey_number", { ascending: true, nullsFirst: false });
    setRoster((data ?? []) as unknown as PlayerWithUser[]);
  }, [seasonId]);

  // Carrega ou cria sessão de jogo
  const loadSession = useCallback(async () => {
    setLoading(true);
    const { data: existing } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("event_id", eventId)
      .single();

    if (existing) {
      setSession(existing);
      await loadPlays(existing.id);
      await loadPlayerStats(existing.id);
      await loadPeriodScores(existing.id);
    }
    setLoading(false);
  }, [eventId]);

  async function loadPlays(sessionId: string) {
    const { data } = await supabase
      .from("play_by_play")
      .select("*")
      .eq("game_session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(100);
    setPlays(data ?? []);
  }

  async function loadPlayerStats(sessionId: string) {
    const { data } = await supabase
      .from("player_game_stats")
      .select("*, user:users(id, name)")
      .eq("game_session_id", sessionId);
    setPlayerStats((data ?? []) as unknown as PlayerGameStatsWithUser[]);
  }

  async function loadPeriodScores(sessionId: string) {
    const { data } = await supabase
      .from("game_period_scores")
      .select("*")
      .eq("game_session_id", sessionId)
      .order("period");
    setPeriodScores(data ?? []);
  }

  useEffect(() => {
    loadRoster();
    loadSession();
  }, [loadRoster, loadSession]);

  // ── Criar sessão de jogo ──────────────────────────────────
  async function startGame(opponentName: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("game_sessions")
      .insert({
        event_id: eventId,
        season_id: seasonId,
        opponent_name: opponentName,
        status: "live",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao iniciar jogo", description: error.message, variant: "destructive" });
      return false;
    }

    // Regista início de jogo no play-by-play
    await supabase.from("play_by_play").insert({
      game_session_id: data.id,
      season_id: seasonId,
      period: 1,
      event_type: "game_start",
      is_home_team: true,
      points_delta: 0,
      home_score_after: 0,
      away_score_after: 0,
      description: "Início do jogo",
    });

    // Inicializa stats para todos os jogadores do plantel
    if (roster.length > 0) {
      await supabase.from("player_game_stats").insert(
        roster.map((p) => ({
          game_session_id: data.id,
          season_id: seasonId,
          player_id: p.user_id,
        }))
      );
    }

    setSession(data);
    toast({ title: "Jogo iniciado!" });
    await loadPlays(data.id);
    await loadPlayerStats(data.id);
    return true;
  }

  // ── Registar evento play-by-play ──────────────────────────
  async function recordPlay(input: RecordPlayInput): Promise<boolean> {
    if (!session) return false;
    setRecording(true);

    const pointsDelta = POINTS_MAP[input.event_type] ?? 0;
    const newHomeScore = session.home_score + pointsDelta;

    // 1. Insere play no play_by_play
    const { error: pbpError } = await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: seasonId,
      period: session.current_period,
      game_clock: input.game_clock ?? "00:00",
      event_type: input.event_type,
      player_id: input.player_id ?? null,
      secondary_player_id: input.secondary_player_id ?? null,
      is_home_team: true,
      points_delta: pointsDelta,
      home_score_after: newHomeScore,
      away_score_after: session.away_score,
      shot_x: input.shot_x ?? null,
      shot_y: input.shot_y ?? null,
      shot_zone: input.shot_zone ?? null,
    });

    if (pbpError) {
      toast({ title: "Erro ao registar evento", description: pbpError.message, variant: "destructive" });
      setRecording(false);
      return false;
    }

    // 2. Atualiza score na sessão se houve pontos
    if (pointsDelta > 0) {
      await supabase
        .from("game_sessions")
        .update({ home_score: newHomeScore, updated_at: new Date().toISOString() })
        .eq("id", session.id);
      setSession((s) => s ? { ...s, home_score: newHomeScore } : s);
    }

    // 3. Atualiza stats do jogador
    if (input.player_id) {
      const delta = statDeltaForEvent(input.event_type);
      if (Object.keys(delta).length > 0) {
        // Upsert: garante que existe registo para este jogador
        const existing = playerStats.find((s) => s.player_id === input.player_id);
        const base: Partial<PlayerGameStats> = existing ?? {
          game_session_id: session.id,
          season_id: seasonId,
          player_id: input.player_id,
        };
        const updated = { ...base };
        for (const [k, v] of Object.entries(delta)) {
          if (v !== undefined) {
            (updated as Record<string, number>)[k] = ((updated as Record<string, number>)[k] ?? 0) + v;
          }
        }
        updated.efficiency = calcEfficiency(updated);

        await supabase.from("player_game_stats").upsert(
          { ...updated, updated_at: new Date().toISOString() },
          { onConflict: "game_session_id,player_id" }
        );
      }
    }

    // 4. Atualiza assist para jogador secundário
    if (input.secondary_player_id && input.event_type.endsWith("_made")) {
      const deltaAssist = { ast: 1 };
      const existing = playerStats.find((s) => s.player_id === input.secondary_player_id);
      const base: Partial<PlayerGameStats> = existing ?? {
        game_session_id: session.id,
        season_id: seasonId,
        player_id: input.secondary_player_id,
      };
      const updated = { ...base, ast: ((base.ast ?? 0) + 1) };
      updated.efficiency = calcEfficiency(updated);
      await supabase.from("player_game_stats").upsert(
        { ...updated, updated_at: new Date().toISOString() },
        { onConflict: "game_session_id,player_id" }
      );
    }

    // 5. Recarrega dados frescos
    await loadPlays(session.id);
    await loadPlayerStats(session.id);
    setRecording(false);
    return true;
  }

  // ── Adicionar pontos adversário ───────────────────────────
  async function recordOpponentPoints(pts: number): Promise<void> {
    if (!session) return;
    const newAway = session.away_score + pts;
    await supabase
      .from("game_sessions")
      .update({ away_score: newAway, updated_at: new Date().toISOString() })
      .eq("id", session.id);

    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: seasonId,
      period: session.current_period,
      event_type: pts === 1 ? "ft_made" : pts === 2 ? "2pt_made" : "3pt_made",
      is_home_team: false,
      points_delta: pts,
      home_score_after: session.home_score,
      away_score_after: newAway,
      description: `Adversário +${pts}`,
    });

    setSession((s) => s ? { ...s, away_score: newAway } : s);
    await loadPlays(session.id);
  }

  // ── Avançar período ───────────────────────────────────────
  async function nextPeriod(): Promise<void> {
    if (!session) return;
    const nextP = session.current_period + 1;

    // Guarda pontuação do período anterior
    await supabase.from("game_period_scores").upsert(
      {
        game_session_id: session.id,
        period: session.current_period,
        home_score: session.home_score,
        away_score: session.away_score,
      },
      { onConflict: "game_session_id,period" }
    );

    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: seasonId,
      period: session.current_period,
      event_type: "period_end",
      is_home_team: true,
      points_delta: 0,
      home_score_after: session.home_score,
      away_score_after: session.away_score,
      description: `Fim do ${session.current_period}º período`,
    });

    await supabase
      .from("game_sessions")
      .update({ current_period: nextP, updated_at: new Date().toISOString() })
      .eq("id", session.id);

    setSession((s) => s ? { ...s, current_period: nextP } : s);
    await loadPeriodScores(session.id);
    await loadPlays(session.id);
  }

  // ── Terminar jogo ─────────────────────────────────────────
  async function finishGame(): Promise<boolean> {
    if (!session) return false;

    await supabase.from("play_by_play").insert({
      game_session_id: session.id,
      season_id: seasonId,
      period: session.current_period,
      event_type: "game_end",
      is_home_team: true,
      points_delta: 0,
      home_score_after: session.home_score,
      away_score_after: session.away_score,
      description: `Fim do jogo — CD Póvoa ${session.home_score} vs ${session.away_score} ${session.opponent_name}`,
    });

    await supabase
      .from("game_sessions")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    setSession((s) => s ? { ...s, status: "finished" } : s);
    toast({ title: "Jogo terminado!", description: "Estatísticas guardadas." });
    return true;
  }

  // Computed helpers
  const homeFgPct = (() => {
    const totAtt = playerStats.reduce((s, p) => s + p.fg2_att + p.fg3_att, 0);
    const totMade = playerStats.reduce((s, p) => s + p.fg2_made + p.fg3_made, 0);
    return totAtt > 0 ? Math.round((totMade / totAtt) * 100) : 0;
  })();

  return {
    session,
    plays,
    playerStats,
    periodScores,
    roster,
    loading,
    recording,
    homeFgPct,
    startGame,
    recordPlay,
    recordOpponentPoints,
    nextPeriod,
    finishGame,
  };
}
