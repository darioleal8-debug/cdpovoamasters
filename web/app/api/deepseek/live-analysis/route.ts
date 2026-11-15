import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { MANAGERS } from "@/lib/auth/roles";
import { deepseekJSON } from "@/lib/deepseek";
import { shotsFromPlays, zoneStats, SHOT_ZONE_LABELS } from "@/lib/live/shot-zones";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Analysis {
  headline?: string;
  what_happened?: string[];
  strengths?: string[];
  concerns?: string[];
  suggestions?: string[];
  player_notes?: Array<{ player: string; note: string }>;
  conclusion?: string;
}

const FOUL_TYPES = ["foul_committed", "foul_def", "foul_of", "foul_tec", "foul_anti"];

/** Coach analysis of a live game, from every stat logged so far (DeepSeek). */
export async function POST(req: NextRequest) {
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;
  const supabase = auth.supabase;

  if (!process.env.DEEPSEEK_API_KEY)
    return NextResponse.json({ error: "DEEPSEEK_API_KEY is not configured" }, { status: 500 });

  let sessionId: string;
  try {
    ({ session_id: sessionId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!sessionId) return NextResponse.json({ error: "session_id is required" }, { status: 400 });

  // RLS-scoped client: only returns data from the user's own club
  const { data: session } = await supabase.from("game_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) return NextResponse.json({ error: "Game session not found" }, { status: 404 });

  const [{ data: playsRaw }, { data: stats }] = await Promise.all([
    supabase.from("play_by_play").select("*").eq("game_session_id", sessionId).is("deleted_at", null).order("created_at", { ascending: true }).limit(3000),
    supabase.from("player_game_stats").select("*").eq("game_session_id", sessionId),
  ]);
  const plays = playsRaw ?? [];
  const playerIds = (stats ?? []).map((s) => s.player_id as string);
  const { data: names } = playerIds.length
    ? await supabase.from("v_roster").select("player_id, name, number").in("player_id", playerIds)
    : { data: [] as { player_id: string; name: string; number: number | null }[] };
  const nameOf = new Map((names ?? []).map((n) => [n.player_id as string, `#${n.number ?? "?"} ${n.name}`]));

  // Score by period (from the last play of each period)
  const byPeriod = new Map<number, { home: number; away: number }>();
  for (const p of plays) byPeriod.set(p.period as number, { home: p.home_score_after as number, away: p.away_score_after as number });
  let prev = { home: 0, away: 0 };
  const periodLines = [...byPeriod.entries()].sort((a, b) => a[0] - b[0]).map(([n, sc]) => {
    const line = `P${n}: us ${sc.home - prev.home} – opp ${sc.away - prev.away} (cumulative ${sc.home}–${sc.away})`;
    prev = sc;
    return line;
  });

  const count = (types: string[], home: boolean) => plays.filter((p) => p.is_home_team === home && types.includes(p.event_type as string)).length;
  const oppFouls = count(FOUL_TYPES, false);
  const oppReb = count(["rebound_off", "rebound_def"], false);

  const shots = shotsFromPlays(plays, {});
  const zones = zoneStats(shots).filter((z) => z.att > 0)
    .map((z) => `${SHOT_ZONE_LABELS[z.zone]}: ${z.made}/${z.att}`).join("; ");

  const playerLines = (stats ?? [])
    .filter((s) => (s.pts ?? 0) + (s.reb_off ?? 0) + (s.reb_def ?? 0) + (s.ast ?? 0) + (s.stl ?? 0) + (s.blk ?? 0) + (s.tov ?? 0) + (s.fouls_committed ?? 0) + (s.fg2_att ?? 0) + (s.fg3_att ?? 0) + (s.ft_att ?? 0) + (s.seconds_played ?? 0) > 0)
    .map((s) =>
      `${nameOf.get(s.player_id as string) ?? s.player_id}: ${Math.round(((s.seconds_played as number) ?? 0) / 60)} min, ${s.pts} pts, 2PT ${s.fg2_made}/${s.fg2_att}, 3PT ${s.fg3_made}/${s.fg3_att}, FT ${s.ft_made}/${s.ft_att}, REB ${(s.reb_off ?? 0) + (s.reb_def ?? 0)} (off ${s.reb_off}), AST ${s.ast}, STL ${s.stl}, BLK ${s.blk}, TOV ${s.tov}, fouls ${s.fouls_committed}, +/- ${s.plus_minus ?? 0}`
    )
    .join("\n");

  const homeFg = (stats ?? []).reduce((a, s) => ({ m: a.m + (s.fg2_made ?? 0) + (s.fg3_made ?? 0), a: a.a + (s.fg2_att ?? 0) + (s.fg3_att ?? 0) }), { m: 0, a: 0 });
  const homeTov = (stats ?? []).reduce((a, s) => a + (s.tov ?? 0), 0);

  const status = session.status === "finished" ? "finished" : `in progress (period ${session.current_period})`;
  const data = [
    `Game status: ${status}.`,
    `Score: us ${session.home_score} – ${session.opponent_name ?? "opponent"} ${session.away_score}.`,
    periodLines.length ? `Points by period:\n${periodLines.join("\n")}` : "",
    `Our team: FG ${homeFg.m}/${homeFg.a}, turnovers ${homeTov}.`,
    `Opponent (team totals only, no individual tracking): rebounds ${oppReb}, fouls ${oppFouls}.`,
    zones ? `Our field goals by court zone (made/attempted): ${zones}.` : "No located shots yet.",
    playerLines ? `Our players:\n${playerLines}` : "No player stats yet.",
  ].filter(Boolean).join("\n\n");

  const system = `You are an experienced basketball assistant coach analysing a game for the head coach.
Use ONLY the data given; never invent numbers, plays or players. If the sample is small (early in the game), say so.
Be concrete and actionable, in plain English, short sentences.
Reply with a single json object: {"headline": string, "what_happened": string[], "strengths": string[], "concerns": string[], "suggestions": string[], "player_notes": [{"player": string, "note": string}], "conclusion": string}.
Each list has 2-5 items; "suggestions" are tactical adjustments for the next minutes/games (rotations, shot selection by zone, foul trouble, rebounding, turnovers).`;

  const ai = await deepseekJSON<Analysis>({
    system,
    user: `Game data so far:\n\n${data}`,
    maxTokens: 2500,
    feature: "live-game-analysis",
  });
  if (!ai.ok) {
    console.error("[deepseek/live-analysis]", ai.error);
    return NextResponse.json({ error: ai.error }, { status: 502 });
  }
  return NextResponse.json({ analysis: ai.data, generatedAt: new Date().toISOString() });
}
