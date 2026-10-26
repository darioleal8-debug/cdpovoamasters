import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { hasAnyRole, MANAGERS } from "@/lib/auth/roles";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getOfficialGameSessionIds } from "@/lib/stats/official-games";

export const runtime = "nodejs";

function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await params;
  const seasonId = req.nextUrl.searchParams.get("seasonId");
  if (!seasonId) return fail("seasonId é obrigatório");

  // Sessão + conta ativa; o papel vem de authorize() (papel ativo)
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const db = adminDb();

  const isPrivileged = hasAnyRole(auth.profile, MANAGERS);

  if (!isPrivileged) {
    const { data: ownProfile } = await db
      .from("player_profiles")
      .select("id")
      .eq("id", playerId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ownProfile) return fail("Sem permissão", 403);
  }

  type TrainingRow = { id: string; event_date: string; title: string };
  type GameSessionRow = {
    id: string; opponent_name: string;
    home_score: number | null; away_score: number | null;
    event: { id: string; event_date: string; opponent: string | null } | null;
  };

  // Training sessions: join training_attendance → events
  const { data: trainingRows } = await db
    .from("training_attendance")
    .select("status, training:events!training_attendance_training_id_fkey(id, event_date, title)")
    .eq("player_id", playerId);

  const trainingSessions = (trainingRows ?? [])
    .filter((r) => r.training != null)
    .map((r) => {
      const ev = (r.training as unknown) as TrainingRow;
      return {
        id:     ev.id,
        date:   ev.event_date,
        title:  ev.title,
        status: r.status as string,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Game sessions: player_game_stats → game_sessions → events
  const { data: gameStatsRows } = await db
    .from("player_game_stats")
    .select(`
      pts, reb_off, reb_def, ast, stl, blk, tov, seconds_played,
      game_session:game_sessions!player_game_stats_game_session_id_fkey(
        id, opponent_name, home_score, away_score,
        event:events!game_sessions_event_id_fkey(id, event_date, opponent)
      )
    `)
    .eq("player_id", playerId)
    .eq("season_id", seasonId);

  // Só jogos oficiais contam (exclui treinos/amigáveis, testes e eliminados)
  const officialSessionIds = new Set(await getOfficialGameSessionIds(db, seasonId));

  const gameSessions = (gameStatsRows ?? [])
    .filter((r) => r.game_session != null)
    .filter((r) => officialSessionIds.has(((r.game_session as unknown) as GameSessionRow).id))
    .map((r) => {
      const gs = (r.game_session as unknown) as GameSessionRow;
      const ev = gs.event;
      return {
        game_session_id: gs.id,
        date:      ev?.event_date ?? "",
        opponent:  gs.opponent_name || ev?.opponent || "—",
        home_score: gs.home_score,
        away_score: gs.away_score,
        pts:     r.pts as number,
        reb:     (r.reb_off as number) + (r.reb_def as number),
        ast:     r.ast as number,
        stl:     r.stl as number,
        blk:     r.blk as number,
        tov:     r.tov as number,
        minutes: r.seconds_played != null ? Math.round((r.seconds_played as number) / 60) : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ training_sessions: trainingSessions, game_sessions: gameSessions });
}
