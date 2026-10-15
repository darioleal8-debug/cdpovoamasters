import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// After saving a result with no live play-by-play data,
// create minimal player_game_stats rows for all called-up players
// so they count as "having played" in attendance/assiduidade stats.
async function ensureCallupStats(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  sessionId: string,
  seasonId: string,
  eventId: string,
) {
  // Check if there are any live plays for this session
  const { count: playsCount } = await admin
    .from("play_by_play")
    .select("id", { count: "exact", head: true })
    .eq("game_session_id", sessionId)
    .is("deleted_at", null);

  // If live stats exist, respect them — don't touch player_game_stats
  if ((playsCount ?? 0) > 0) return;

  // Fetch all callups for this game
  const { data: callups } = await admin
    .from("game_callups")
    .select("player_id")
    .eq("game_id", eventId);

  if (!callups || callups.length === 0) return;

  // Upsert a zero-stats row for each callup (marks them as "played")
  const rows = callups.map((c) => ({
    game_session_id:  sessionId,
    season_id:        seasonId,
    player_id:        c.player_id as string,
    minutes_played:   0,
    pts:              0,
    fg2_made:         0,
    fg2_att:          0,
    fg3_made:         0,
    fg3_att:          0,
    ft_made:          0,
    ft_att:           0,
    reb_off:          0,
    reb_def:          0,
    ast:              0,
    stl:              0,
    blk:              0,
    tov:              0,
    fouls_committed:  0,
    fouls_drawn:      0,
    plus_minus:       0,
    efficiency:       0,
    seconds_played:   0,
  }));

  const { error } = await admin
    .from("player_game_stats")
    .upsert(rows, { onConflict: "game_session_id,player_id" });

  if (error) {
    console.error("[result] ensureCallupStats upsert error:", error.message);
  }
}

// POST /api/games/[id]/result
// Body: { home_score: number, away_score: number }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "treinador"].includes(profile.role)) {
    return fail("Sem permissão", 403);
  }

  let body: { home_score?: unknown; away_score?: unknown };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const homeScore = body.home_score;
  const awayScore = body.away_score;

  if (typeof homeScore !== "number" || typeof awayScore !== "number") {
    return fail("home_score e away_score são obrigatórios");
  }
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
    return fail("Os pontos devem ser números inteiros não negativos");
  }

  const admin = await createAdminClient();

  // Validate event
  const { data: event } = await admin
    .from("events")
    .select("id, season_id, opponent, event_date, type")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return fail("Evento não encontrado", 404);
  if ((event.type as string) !== "jogo") return fail("Apenas jogos têm resultado");

  const today = new Date().toISOString().slice(0, 10);
  if ((event.event_date as string) >= today) {
    return fail("Só é possível registar resultado de jogos já realizados");
  }

  const seasonId = event.season_id as string;
  const now = new Date().toISOString();

  // Check existing session
  const { data: existing } = await admin
    .from("game_sessions")
    .select("id, status")
    .eq("event_id", eventId)
    .maybeSingle();

  let sessionId: string;

  if (existing) {
    const { data: updated, error } = await admin
      .from("game_sessions")
      .update({
        home_score:  homeScore,
        away_score:  awayScore,
        status:      "finished",
        finished_at: now,
        updated_at:  now,
      })
      .eq("id", (existing as { id: string }).id)
      .select("id, home_score, away_score, status, event_id")
      .single();
    if (error) {
      console.error("[result] update error:", error.message);
      return fail(error.message, 500);
    }
    sessionId = (updated as { id: string }).id;
    await ensureCallupStats(admin, sessionId, seasonId, eventId);
    return NextResponse.json({ session: updated });
  } else {
    const { data: created, error } = await admin
      .from("game_sessions")
      .insert({
        event_id:             eventId,
        season_id:            seasonId,
        opponent_name:        (event.opponent as string | null) ?? "Adversário",
        home_score:           homeScore,
        away_score:           awayScore,
        status:               "finished",
        current_period:       4,
        started_at:           now,
        finished_at:          now,
        clock_running:        false,
        clock_elapsed_secs:   0,
        period_duration_secs: 600,
        home_timeouts_left:   0,
        away_timeouts_left:   0,
        away_reb_off:         0,
        away_reb_def:         0,
        away_fouls:           0,
      })
      .select("id, home_score, away_score, status, event_id")
      .single();
    if (error) {
      console.error("[result] insert error:", error.message);
      return fail(error.message, 500);
    }
    sessionId = (created as { id: string }).id;
    await ensureCallupStats(admin, sessionId, seasonId, eventId);
    return NextResponse.json({ session: created }, { status: 201 });
  }
}
