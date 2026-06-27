"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeClockSecs, formatClock } from "@/hooks/use-live-game";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { GameSession, PlayerGameStatsWithUser, PlayByPlay } from "@/types/database";

function pct(made: number, att: number) {
  return att > 0 ? `${Math.round((made / att) * 100)}%` : "—";
}

const EVENT_LABELS: Record<string, string> = {
  "2pt_made": "2P ✓", "2pt_miss": "2P ✗",
  "3pt_made": "3P ✓", "3pt_miss": "3P ✗",
  "ft_made": "LL ✓", "ft_miss": "LL ✗",
  "rebound_off": "Res.Of.", "rebound_def": "Res.Def.",
  "assist": "Assist.", "steal": "Roubo", "block": "Desarme",
  "turnover": "Turnover", "foul_committed": "F.Cometida",
  "foul_drawn": "F.Sofrida", "substitution_in": "Substituição",
  "timeout": "Timeout", "game_start": "🏀 Início",
  "period_end": "Fim Período", "game_end": "🏁 Fim Jogo",
};

interface PlayerRow extends PlayerGameStatsWithUser {
  jersey_number?: number | null;
}

export default function SpectatorPage() {
  const params = useParams<{ id: string }>();
  const supabase = createClient();

  const [session, setSession] = useState<GameSession | null>(null);
  const [stats, setStats] = useState<PlayerRow[]>([]);
  const [plays, setPlays] = useState<PlayByPlay[]>([]);
  const [clockSecs, setClockSecs] = useState(600);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [sessRes, statsRes, playsRes] = await Promise.all([
      supabase.from("game_sessions").select("*").eq("id", params.id).single(),
      supabase.from("player_game_stats").select("*, user:users(id, name)").eq("game_session_id", params.id),
      supabase.from("play_by_play").select("*").eq("game_session_id", params.id)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    if (sessRes.data) {
      const sess = sessRes.data as GameSession;
      setSession(sess);
      setClockSecs(computeClockSecs(sess));
    }
    setStats((statsRes.data ?? []) as PlayerRow[]);
    setPlays(playsRes.data ?? []);
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`spectator-${params.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "game_sessions", filter: `id=eq.${params.id}` },
        (payload) => { setSession(payload.new as GameSession); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "player_game_stats", filter: `game_session_id=eq.${params.id}` },
        () => { loadAll(); })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "play_by_play", filter: `game_session_id=eq.${params.id}` },
        () => {
          supabase.from("play_by_play").select("*").eq("game_session_id", params.id)
            .order("created_at", { ascending: false }).limit(20)
            .then(({ data }) => setPlays(data ?? []));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [params.id]);

  // Clock tick
  useEffect(() => {
    if (!session?.clock_running) return;
    const interval = setInterval(() => setClockSecs(computeClockSecs(session)), 500);
    return () => clearInterval(interval);
  }, [session?.clock_running, session?.clock_started_at, session?.clock_elapsed_secs]);

  useEffect(() => {
    if (session) setClockSecs(computeClockSecs(session));
  }, [session?.clock_elapsed_secs, session?.clock_running]);

  const isLive = session?.status === "live";
  const sorted = [...stats].sort((a, b) => b.pts - a.pts);

  if (loading) {
    return (
      <div className="min-h-screen bg-cdpovoa-blue p-4 space-y-4">
        <Skeleton className="h-32 w-full rounded-xl bg-white/10" />
        <Skeleton className="h-64 w-full rounded-xl bg-white/10" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-cdpovoa-blue flex items-center justify-center text-white">
        <p className="text-white/60">Jogo não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cdpovoa-blue text-white pb-8">
      {/* ── Scoreboard ─────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-cdpovoa-blue border-b border-white/10 px-4 py-4">
        {/* Live badge + period */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <Badge className={isLive ? "bg-green-500 animate-pulse" : "bg-white/20"}>
            {isLive ? "● AO VIVO" : session.status === "finished" ? "FINAL" : "Por iniciar"}
          </Badge>
          {session.current_period && (
            <span className="text-sm text-white/60">{session.current_period}º Período</span>
          )}
          {isLive && (
            <span className={`text-sm font-mono font-bold ${clockSecs <= 30 ? "text-red-400" : "text-white/80"}`}>
              {formatClock(clockSecs)}
            </span>
          )}
        </div>

        {/* Score */}
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1">CD Póvoa Masters</p>
            <p className="text-6xl font-black tabular-nums leading-none">{session.home_score}</p>
          </div>
          <div className="text-3xl font-bold text-white/30 px-4">–</div>
          <div className="text-center flex-1">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1 truncate max-w-[120px] mx-auto">
              {session.opponent_name}
            </p>
            <p className="text-6xl font-black tabular-nums leading-none">{session.away_score}</p>
          </div>
        </div>
      </div>

      {/* ── Player stats table ──────────────────────────── */}
      {sorted.length > 0 && (
        <div className="px-3 pt-4">
          <p className="text-[0.65rem] uppercase tracking-widest text-white/40 mb-2">Estatísticas</p>
          <div className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-3 py-2 text-white/60 font-medium">Jogador</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">PTS</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">REB</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">AST</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">STL</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">BLK</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">TOV</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">2P%</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">3P%</th>
                  <th className="px-2 py-2 text-center text-white/60 font-medium">EFF</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.player_id} className={`border-b border-white/5 ${i === 0 ? "bg-white/10" : ""}`}>
                    <td className="px-3 py-2 font-medium text-white">
                      {p.jersey_number !== undefined && p.jersey_number !== null && (
                        <span className="mr-1 text-white/40">#{p.jersey_number}</span>
                      )}
                      {p.user.name.split(" ").slice(0, 2).join(" ")}
                    </td>
                    <td className={`px-2 py-2 text-center tabular-nums font-bold ${p.pts >= 10 ? "text-green-400" : "text-white"}`}>{p.pts}</td>
                    <td className="px-2 py-2 text-center text-white/80 tabular-nums">{p.reb_off + p.reb_def}</td>
                    <td className="px-2 py-2 text-center text-white/80 tabular-nums">{p.ast}</td>
                    <td className="px-2 py-2 text-center text-white/80 tabular-nums">{p.stl}</td>
                    <td className="px-2 py-2 text-center text-white/80 tabular-nums">{p.blk}</td>
                    <td className="px-2 py-2 text-center text-white/80 tabular-nums">{p.tov}</td>
                    <td className="px-2 py-2 text-center text-white/60 tabular-nums">{pct(p.fg2_made, p.fg2_att)}</td>
                    <td className="px-2 py-2 text-center text-white/60 tabular-nums">{pct(p.fg3_made, p.fg3_att)}</td>
                    <td className="px-2 py-2 text-center font-bold text-yellow-400 tabular-nums">{Number(p.efficiency).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Play feed ──────────────────────────────────── */}
      {plays.length > 0 && (
        <div className="px-3 pt-5">
          <p className="text-[0.65rem] uppercase tracking-widest text-white/40 mb-2">Últimos eventos</p>
          <div className="space-y-1">
            {plays.filter((p) => !["period_start", "game_start"].includes(p.event_type)).slice(0, 15).map((p, i) => (
              <div key={p.id}
                className={`flex items-center gap-2 text-xs py-1 px-2 rounded-lg ${i === 0 ? "bg-white/15" : "bg-white/5"}`}>
                <span className="shrink-0 text-white/30 w-4 font-mono">{p.period}P</span>
                {p.game_clock && (
                  <span className="shrink-0 text-white/30 font-mono">{p.game_clock}</span>
                )}
                <span className={`flex-1 ${p.is_home_team ? "text-white/80" : "text-white/40 italic"}`}>
                  {p.description ?? (EVENT_LABELS[p.event_type] ?? p.event_type)}
                </span>
                {p.points_delta > 0 && (
                  <span className={`font-bold shrink-0 ${p.is_home_team ? "text-green-400" : "text-red-400"}`}>
                    +{p.points_delta}
                  </span>
                )}
                <span className="shrink-0 text-white/30 tabular-nums font-mono">
                  {p.home_score_after}–{p.away_score_after}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <div className="text-center mt-8 text-white/20 text-xs">
        CD Póvoa Masters · Atualização em tempo real
      </div>
    </div>
  );
}
