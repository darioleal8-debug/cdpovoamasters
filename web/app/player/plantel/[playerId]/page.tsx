import { getOfficialGameSessionIds } from "@/lib/stats/official-games";
import { createAdminClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/auth/guards";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { POSITION_LABELS } from "@/lib/utils";
import { calculateAge } from "@/lib/age";
import { aggregateAverages, type GameStatRow, type PlayerAverages } from "@/lib/stats/team-averages";
import { COLS } from "@/lib/stats/columns";
import { abbr } from "@/lib/stats/terminology";

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
  // Verificação própria: na navegação cliente o layout não volta a correr (revisão final, Importante 3)
  const authz = await authorize();
  if (!authz.ok) redirect(authz.response.status === 401 ? "/login" : "/login?reason=inactive");

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
  // Só jogos oficiais contam (exclui treinos/amigáveis, testes e eliminados)
  const officialSessionIds = await getOfficialGameSessionIds(admin, player.season_id, { finishedOnly: true });
  const { data: statsRaw } = await admin
    .from("player_game_stats")
    .select("id, game_session_id, pts, reb_off, reb_def, ast, stl, blk, tov, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, seconds_played, efficiency") // minutes_played nunca é escrito (STA-10)
    .eq("player_id", playerId)
    .eq("season_id", player.season_id)
    .in("game_session_id", officialSessionIds.length ? officialSessionIds : ["00000000-0000-0000-0000-000000000000"]);

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
      minutes_played:  Number(s.seconds_played ?? 0) / 60,
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

  // ── 4b. Médias completas: época deste jogador e todas as temporadas (mesma conta) ──
  type PgsRow = Omit<GameStatRow, "key">;
  const { data: sameUser } = player.user_id
    ? await admin.from("players").select("id, season_id").eq("user_id", player.user_id)
    : { data: [] as { id: string; season_id: string }[] };
  const myRecords = ((sameUser ?? []) as { id: string; season_id: string }[]);
  if (!myRecords.some((r) => r.id === playerId)) myRecords.push({ id: playerId, season_id: player.season_id as string });
  const { data: seasonRows } = await admin
    .from("seasons")
    .select("id, name, start_date")
    .in("id", [...new Set(myRecords.map((r) => r.season_id))])
    .order("start_date", { ascending: true });

  const seasonAverages: { id: string; name: string; avg: PlayerAverages }[] = [];
  const allRows: GameStatRow[] = [];
  for (const se of (seasonRows ?? []) as { id: string; name: string }[]) {
    const sessionIds = await getOfficialGameSessionIds(admin, se.id, { finishedOnly: true });
    if (!sessionIds.length) continue;
    const { data: rows } = await admin
      .from("player_game_stats")
      .select("pts, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, fouls_drawn, efficiency, seconds_played, plus_minus")
      .eq("season_id", se.id)
      .in("player_id", myRecords.filter((r) => r.season_id === se.id).map((r) => r.id))
      .in("game_session_id", sessionIds);
    const keyed = ((rows ?? []) as PgsRow[]).map((r) => ({ ...r, key: "me" }));
    if (!keyed.length) continue;
    allRows.push(...keyed);
    seasonAverages.push({ id: se.id, name: se.name, avg: aggregateAverages(keyed)[0] });
  }
  const currentAvg = seasonAverages.find((x) => x.id === player.season_id)?.avg ?? null;
  const careerAvg = allRows.length ? aggregateAverages(allRows)[0] : null;

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
    <div className="space-y-5 max-w-lg lg:max-w-5xl">

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
            { label: abbr("ppg"), val: avgPts },
            { label: abbr("rpg"), val: avgReb },
            { label: abbr("apg"), val: avgAst },
            { label: abbr("eff"), val: avgEff },
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

      {/* Estatísticas completas da época (médias por jogo, terminologia NBA) */}
      {currentAvg && (
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text,#5A6478)" }}>
            Estatísticas da época · {season?.name ?? "—"} · médias por jogo
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
            {COLS.map((c) => (
              <div
                key={c.id}
                title={c.title}
                className="flex flex-col items-center rounded-xl py-2.5 gap-0.5"
                style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
              >
                <span className="text-[11px] font-semibold" style={{ color: "var(--muted-text,#5A6478)" }}>{c.label}</span>
                <span className={`text-lg lg:text-xl tabular-nums ${c.strong ? "font-black" : "font-bold"}`} style={{ color: "var(--ink,#0A1220)" }}>
                  {c.render(currentAvg)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Todas as temporadas */}
      {seasonAverages.length > 1 && careerAvg && (
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-text,#5A6478)" }}>
            Todas as temporadas · médias por jogo
          </p>
          <div className="rounded-2xl border overflow-x-auto" style={{ background: "var(--paper,#F6F7F9)", borderColor: "var(--line,#E4E7EE)" }}>
            <table className="w-full text-xs md:text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--line,#E4E7EE)" }}>
                  <th className="text-left px-3 py-2.5 font-semibold sticky left-0 z-10 min-w-[130px]" style={{ background: "var(--paper,#F6F7F9)" }}>Temporada</th>
                  {COLS.map((c) => (
                    <th key={c.id} title={c.title} className="px-2 md:px-2.5 py-2.5 text-center font-semibold">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--line,#E4E7EE)" }}>
                {[...seasonAverages.map((x) => ({ key: x.id, label: x.name, avg: x.avg, total: false })),
                  { key: "career", label: "Carreira (todas)", avg: careerAvg, total: true }].map((r) => (
                  <tr key={r.key} className={r.total ? "font-bold" : r.key === player.season_id ? "bg-orange-50" : ""}>
                    <td className="px-3 py-2.5 sticky left-0 z-10" style={{ background: r.total ? "#fff" : r.key === player.season_id ? "#fff7ed" : "var(--paper,#F6F7F9)" }}>
                      {r.label}
                    </td>
                    {COLS.map((c) => (
                      <td key={c.id} className={`px-2 md:px-2.5 py-2.5 text-center tabular-nums ${c.muted ? "text-muted-foreground" : ""}`}>
                        {c.render(r.avg)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {seasonAverages.length === 1 && (
        <p className="text-xs" style={{ color: "var(--muted-text,#5A6478)" }}>
          Só há uma temporada com jogos registados; as médias de todas as temporadas aparecem quando houver mais.
        </p>
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
                      <p className="text-[11px] font-medium" style={{ color: "var(--muted-text,#5A6478)" }}>PTS</p>
                    </div>
                    <div>
                      <p className="text-base font-black tabular-nums" style={{ color: "var(--ink,#0A1220)" }}>
                        {reb}
                      </p>
                      <p className="text-[11px] font-medium" style={{ color: "var(--muted-text,#5A6478)" }}>REB</p>
                    </div>
                    <div>
                      <p className="text-base font-black tabular-nums" style={{ color: "var(--ink,#0A1220)" }}>
                        {g.ast}
                      </p>
                      <p className="text-[11px] font-medium" style={{ color: "var(--muted-text,#5A6478)" }}>AST</p>
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
