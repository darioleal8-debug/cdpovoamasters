import { createAdminClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { POSITION_LABELS } from "@/lib/utils";
import { calculateAge } from "@/lib/age";

export const dynamic = "force-dynamic";

function fmt1(n: number) { return n.toFixed(1); }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}
function pct(made: number, att: number) {
  return att > 0 ? `${Math.round((made / att) * 100)}%` : null;
}

export default async function PlayerPublicProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  if (!playerId || playerId === "null") notFound();

  const admin = await createAdminClient();

  // ── 1. Jogador ────────────────────────────────────────────
  const { data: player } = await admin
    .from("players")
    .select("id, season_id, number, position, height, weight, age, birth_date, photo_url, user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  // ── 2. Nome (sem email, sem telefone) ─────────────────────
  const { data: userRow } = await admin
    .from("users")
    .select("name")
    .eq("id", player.user_id)
    .maybeSingle();

  const name     = (userRow?.name as string) || "Jogador";
  const initials = name.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const age      = player.birth_date ? calculateAge(player.birth_date as string) : (player.age as number | null);

  // ── 3. Temporada ──────────────────────────────────────────
  const { data: season } = await admin
    .from("seasons")
    .select("name")
    .eq("id", player.season_id)
    .maybeSingle();

  // ── 4. Estatísticas de jogo ───────────────────────────────
  const { data: statsRaw } = await admin
    .from("player_game_stats")
    .select("id, game_session_id, pts, reb_off, reb_def, ast, stl, blk, tov, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, minutes_played, efficiency")
    .eq("player_id", playerId)
    .eq("season_id", player.season_id);

  type GameStat = {
    id: string; game_session_id: string;
    pts: number; reb_off: number; reb_def: number;
    ast: number; stl: number; blk: number; tov: number;
    fg2_made: number; fg2_att: number; fg3_made: number; fg3_att: number;
    ft_made: number; ft_att: number; minutes_played: number; efficiency: number;
    eventDate: string | null; opponent: string | null;
  };

  let gameStats: GameStat[] = [];

  if ((statsRaw ?? []).length > 0) {
    const sessionIds = (statsRaw ?? []).map((s) => s.game_session_id as string);
    const { data: sessions } = await admin
      .from("game_sessions")
      .select("id, event_id, opponent_name")
      .in("id", sessionIds);

    const eventIds = (sessions ?? []).map((s) => s.event_id as string).filter(Boolean);
    const { data: events } = eventIds.length > 0
      ? await admin.from("events").select("id, event_date").in("id", eventIds)
      : { data: [] };

    const evtMap = new Map((events ?? []).map((e) => [e.id as string, e.event_date as string | null]));
    const sesMap = new Map((sessions ?? []).map((s) => [
      s.id as string,
      { eventDate: evtMap.get(s.event_id as string) ?? null, opponent: (s.opponent_name as string) || null },
    ]));

    gameStats = (statsRaw ?? []).map((s) => ({
      id:              s.id as string,
      game_session_id: s.game_session_id as string,
      pts:             Number(s.pts ?? 0),
      reb_off:         Number(s.reb_off ?? 0),
      reb_def:         Number(s.reb_def ?? 0),
      ast:             Number(s.ast ?? 0),
      stl:             Number(s.stl ?? 0),
      blk:             Number(s.blk ?? 0),
      tov:             Number(s.tov ?? 0),
      fg2_made:        Number(s.fg2_made ?? 0),
      fg2_att:         Number(s.fg2_att ?? 0),
      fg3_made:        Number(s.fg3_made ?? 0),
      fg3_att:         Number(s.fg3_att ?? 0),
      ft_made:         Number(s.ft_made ?? 0),
      ft_att:          Number(s.ft_att ?? 0),
      minutes_played:  Number(s.minutes_played ?? 0),
      efficiency:      Number(s.efficiency ?? 0),
      ...(sesMap.get(s.game_session_id as string) ?? { eventDate: null, opponent: null }),
    })).sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));
  }

  const n = gameStats.length;
  function avgStat(key: keyof GameStat) {
    if (!n) return null;
    return (gameStats.reduce((s, g) => s + Number(g[key] ?? 0), 0) / n);
  }

  const avgPts = avgStat("pts");
  const avgReb = n ? gameStats.reduce((s, g) => s + g.reb_off + g.reb_def, 0) / n : null;
  const avgAst = avgStat("ast");
  const avgEff = avgStat("efficiency");

  // ── 5. Presença nos treinos (só a percentagem) ────────────
  const { data: attStats } = await admin
    .from("player_attendance_stats")
    .select("attendance_pct, present, total_trainings")
    .eq("player_id", playerId)
    .eq("season_id", player.season_id)
    .maybeSingle();

  const posLabel = player.position
    ? (POSITION_LABELS[player.position as keyof typeof POSITION_LABELS] ?? player.position as string)
    : null;

  return (
    <div className="space-y-5 max-w-lg">

      {/* Back */}
      <Link
        href="/player/plantel"
        className="inline-flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: "var(--muted-text,#5A6478)" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Plantel
      </Link>

      {/* Header */}
      <div
        className="flex items-center gap-4 rounded-2xl p-4"
        style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
      >
        {player.photo_url ? (
          <img
            src={player.photo_url as string}
            alt={name}
            className="h-20 w-20 rounded-full object-cover shrink-0"
            style={{ border: "2px solid var(--line,#E4E7EE)" }}
          />
        ) : (
          <div
            className="h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
            style={{ background: "rgba(249,115,22,0.10)", color: "#F97316" }}
          >
            {initials || <User className="h-8 w-8" />}
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {player.number != null && (
              <span className="text-3xl font-black tabular-nums leading-none" style={{ color: "#F97316" }}>
                #{player.number}
              </span>
            )}
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--ink,#0A1220)" }}>
              {name}
            </h1>
          </div>
          {posLabel && (
            <p className="text-sm font-medium mt-0.5" style={{ color: "#F97316" }}>{posLabel}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>
            {player.height && <span>{player.height} cm</span>}
            {player.weight && <span>{player.weight} kg</span>}
            {age != null && <span>{age} anos</span>}
            <span>{season?.name ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Stats rápidas */}
      {n > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "PTS", val: avgPts },
            { label: "REB", val: avgReb },
            { label: "AST", val: avgAst },
            { label: "EFF", val: avgEff },
          ].map(({ label, val }) => (
            <div
              key={label}
              className="flex flex-col items-center rounded-2xl py-3 gap-0.5"
              style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
            >
              <span className="text-[11px] font-semibold uppercase" style={{ color: "var(--muted-text,#5A6478)" }}>
                {label}
              </span>
              <span className="text-xl font-black tabular-nums" style={{ color: "var(--ink,#0A1220)" }}>
                {val != null ? fmt1(val) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Presença nos treinos */}
      {attStats && (attStats.total_trainings as number) > 0 && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold" style={{ color: "var(--ink,#0A1220)" }}>
              Presença nos treinos
            </p>
            <p className="text-lg font-black tabular-nums" style={{ color: attStats.attendance_pct as number >= 75 ? "#16a34a" : "#F97316" }}>
              {Math.round(attStats.attendance_pct as number)}%
            </p>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--line,#E4E7EE)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width:      `${Math.min(100, attStats.attendance_pct as number)}%`,
                background: attStats.attendance_pct as number >= 75 ? "#16a34a" : "#F97316",
              }}
            />
          </div>
          <p className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>
            {attStats.present} de {attStats.total_trainings} treinos
          </p>
        </div>
      )}

      {/* Histórico de jogos */}
      {n > 0 && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-wide mb-2"
            style={{ color: "var(--muted-text,#5A6478)" }}
          >
            Jogos esta época ({n})
          </p>
          <div
            className="rounded-2xl overflow-hidden divide-y"
            style={{
              border:      "1px solid var(--line,#E4E7EE)",
              background:  "var(--paper,#F6F7F9)",
            }}
          >
            {gameStats.map((g) => {
              const reb = g.reb_off + g.reb_def;
              return (
                <div key={g.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--ink,#0A1220)" }}>
                      {g.opponent ?? "Adversário"}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>
                      {fmtDate(g.eventDate)}
                      {g.minutes_played > 0 ? ` · ${Math.round(g.minutes_played)} min` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div>
                      <p className="text-base font-black tabular-nums" style={{ color: "var(--ink,#0A1220)" }}>
                        {g.pts}
                      </p>
                      <p className="text-[10px] font-medium" style={{ color: "var(--muted-text,#5A6478)" }}>PTS</p>
                    </div>
                    <div>
                      <p className="text-base font-black tabular-nums" style={{ color: "var(--ink,#0A1220)" }}>
                        {reb}
                      </p>
                      <p className="text-[10px] font-medium" style={{ color: "var(--muted-text,#5A6478)" }}>REB</p>
                    </div>
                    <div>
                      <p className="text-base font-black tabular-nums" style={{ color: "var(--ink,#0A1220)" }}>
                        {g.ast}
                      </p>
                      <p className="text-[10px] font-medium" style={{ color: "var(--muted-text,#5A6478)" }}>AST</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {n === 0 && (
        <p className="text-sm text-center py-8" style={{ color: "var(--muted-text,#5A6478)" }}>
          Sem estatísticas de jogo esta época.
        </p>
      )}
    </div>
  );
}
