import { createAdminClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PlayerProfileClient } from "./player-profile-client";

export const dynamic = "force-dynamic";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  if (!playerId || playerId === "null") notFound();

  const admin = await createAdminClient();

  // ── 1. Perfil de jogador ────────────────────────────────────
  const { data: player } = await admin
    .from("players")
    .select("id, season_id, number, position, height, weight, age, birth_date, photo_url, user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  // ── 2. Info do utilizador ───────────────────────────────────
  const { data: userRow } = await admin
    .from("users")
    .select("name, email, phone, role")
    .eq("id", player.user_id)
    .maybeSingle();

  // ── 3. Temporada ────────────────────────────────────────────
  const { data: season } = await admin
    .from("seasons")
    .select("id, name, start_date, end_date, status")
    .eq("id", player.season_id)
    .maybeSingle();

  // ── 4. Pagamentos desta temporada ───────────────────────────
  const { data: payments } = await admin
    .from("player_payments")
    .select("id, month, reference_year, amount, amount_due, status, payment_date, method")
    .eq("player_id", playerId)
    .order("reference_year", { ascending: false })
    .order("month", { ascending: false });

  // ── 5. Convocatórias + dados do jogo ────────────────────────
  const { data: callupRows } = await admin
    .from("game_callups")
    .select("id, game_id, created_at")
    .eq("player_id", playerId);

  let callups: {
    id: string;
    game_id: string;
    created_at: string;
    event: { id: string; event_date: string | null; opponent: string | null; title: string; competition: string | null } | null;
  }[] = [];

  if (callupRows && callupRows.length > 0) {
    const gameIds = callupRows.map((c) => c.game_id as string);
    const { data: events } = await admin
      .from("events")
      .select("id, event_date, opponent, title, competition")
      .in("id", gameIds)
      .eq("type", "jogo")
      .order("event_date", { ascending: false });

    const eventMap = new Map((events ?? []).map((e) => [e.id as string, e]));
    callups = callupRows.map((c) => ({
      id:         c.id as string,
      game_id:    c.game_id as string,
      created_at: c.created_at as string,
      event:      eventMap.get(c.game_id as string) ?? null,
    })).sort((a, b) => {
      const da = a.event?.event_date ?? "";
      const db = b.event?.event_date ?? "";
      return db.localeCompare(da);
    });
  }

  // ── 6. Estatísticas de jogo ─────────────────────────────────
  const { data: gameStatsRaw } = await admin
    .from("player_game_stats")
    .select("id, game_session_id, pts, reb_off, reb_def, ast, stl, blk, tov, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, minutes_played, efficiency")
    .eq("player_id", playerId)
    .eq("season_id", player.season_id);

  let gameStats: {
    id: string; game_session_id: string; pts: number; reb_off: number; reb_def: number;
    ast: number; stl: number; blk: number; tov: number; fg2_made: number; fg2_att: number;
    fg3_made: number; fg3_att: number; ft_made: number; ft_att: number;
    minutes_played: number; efficiency: number;
    session: { home_score: number; away_score: number; opponent_name: string; event_date: string | null } | null;
  }[] = [];

  if (gameStatsRaw && gameStatsRaw.length > 0) {
    const sessionIds = gameStatsRaw.map((s) => s.game_session_id as string);
    const { data: sessions } = await admin
      .from("game_sessions")
      .select("id, event_id, home_score, away_score, opponent_name")
      .in("id", sessionIds);

    const eventIds = (sessions ?? []).map((s) => s.event_id as string).filter(Boolean);
    const { data: statEvents } = eventIds.length > 0
      ? await admin.from("events").select("id, event_date").in("id", eventIds)
      : { data: [] };

    const statEventMap = new Map((statEvents ?? []).map((e) => [e.id as string, e]));
    const sessionMap = new Map(
      (sessions ?? []).map((s) => [
        s.id as string,
        {
          home_score:    s.home_score as number,
          away_score:    s.away_score as number,
          opponent_name: s.opponent_name as string,
          event_date:    statEventMap.get(s.event_id as string)?.event_date ?? null,
        },
      ])
    );

    gameStats = gameStatsRaw.map((s) => ({
      id:             s.id as string,
      game_session_id:s.game_session_id as string,
      pts:            Number(s.pts ?? 0),
      reb_off:        Number(s.reb_off ?? 0),
      reb_def:        Number(s.reb_def ?? 0),
      ast:            Number(s.ast ?? 0),
      stl:            Number(s.stl ?? 0),
      blk:            Number(s.blk ?? 0),
      tov:            Number(s.tov ?? 0),
      fg2_made:       Number(s.fg2_made ?? 0),
      fg2_att:        Number(s.fg2_att ?? 0),
      fg3_made:       Number(s.fg3_made ?? 0),
      fg3_att:        Number(s.fg3_att ?? 0),
      ft_made:        Number(s.ft_made ?? 0),
      ft_att:         Number(s.ft_att ?? 0),
      minutes_played: Number(s.minutes_played ?? 0),
      efficiency:     Number(s.efficiency ?? 0),
      session:        sessionMap.get(s.game_session_id as string) ?? null,
    })).sort((a, b) => (b.session?.event_date ?? "").localeCompare(a.session?.event_date ?? ""));
  }

  // ── 7. Treinos + presenças ──────────────────────────────────
  const { data: seasonTrainings } = await admin
    .from("trainings")
    .select("id, date, start_time, type, location")
    .eq("season_id", player.season_id)
    .order("date", { ascending: false });

  const trainingIds = (seasonTrainings ?? []).map((t) => t.id as string);
  let attendanceMap: Map<string, string> = new Map();

  if (trainingIds.length > 0) {
    const { data: attRows } = await admin
      .from("training_attendance")
      .select("training_id, status")
      .eq("player_id", playerId)
      .in("training_id", trainingIds);
    attendanceMap = new Map((attRows ?? []).map((a) => [a.training_id as string, a.status as string]));
  }

  const trainingsWithAttendance = (seasonTrainings ?? []).map((t) => ({
    id:       t.id as string,
    date:     t.date as string,
    type:     t.type as string | null,
    location: t.location as string | null,
    status:   attendanceMap.get(t.id as string) ?? null,
  }));

  // ── 8. Stats de presença agregadas ─────────────────────────
  const { data: attendanceStats } = await admin
    .from("player_attendance_stats")
    .select("total_trainings, present, absent, justified, late, attendance_pct")
    .eq("player_id", playerId)
    .eq("season_id", player.season_id)
    .maybeSingle();

  return (
    <PlayerProfileClient
      playerId={playerId}
      player={{
        number:    player.number as number | null,
        position:  player.position as string | null,
        height:    player.height as number | null,
        weight:    player.weight as number | null,
        age:       player.age as number | null,
        birth_date:player.birth_date as string | null,
        photo_url: player.photo_url as string | null,
      }}
      userRow={{
        name:  userRow?.name  as string ?? "Jogador",
        email: userRow?.email as string ?? "",
        phone: userRow?.phone as string | null ?? null,
        role:  userRow?.role  as string ?? "jogador",
      }}
      season={{
        id:   season?.id   as string ?? player.season_id as string,
        name: season?.name as string ?? "—",
      }}
      payments={(payments ?? []) as {
        id: string; month: number; reference_year: number;
        amount: number | null; amount_due: number | null;
        status: string | null; payment_date: string | null; method: string | null;
      }[]}
      callups={callups}
      gameStats={gameStats}
      trainings={trainingsWithAttendance}
      attendanceStats={attendanceStats ? {
        total_trainings: Number(attendanceStats.total_trainings),
        present:         Number(attendanceStats.present),
        absent:          Number(attendanceStats.absent),
        justified:       Number(attendanceStats.justified),
        late:            Number(attendanceStats.late),
        attendance_pct:  Number(attendanceStats.attendance_pct),
      } : null}
    />
  );
}
