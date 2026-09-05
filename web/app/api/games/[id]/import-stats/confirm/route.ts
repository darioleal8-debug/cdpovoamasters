import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { ConfirmPayload, ConfirmResult } from "@/lib/stats-importer/types";

export const runtime = "nodejs";

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function calcEfficiency(s: {
  pts: number; reb_off: number; reb_def: number; ast: number; stl: number; blk: number;
  tov: number; fg2_att: number; fg2_made: number; fg3_att: number; fg3_made: number;
  ft_att: number; ft_made: number;
}): number {
  return (
    s.pts + s.reb_off + s.reb_def + s.ast + s.stl + s.blk - s.tov -
    (s.fg2_att - s.fg2_made) - (s.fg3_att - s.fg3_made) - (s.ft_att - s.ft_made)
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // eslint-disable-line @typescript-eslint/no-unused-expressions

  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const db = adminClient();

  const { data: profile } = await db
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (!profile || !["admin", "treinador"].includes(profile.role)) {
    return fail("Sem permissão", 403);
  }

  let body: ConfirmPayload;
  try {
    body = await req.json();
  } catch {
    return fail("JSON inválido");
  }

  const { session_id, mode, assignments, update_score, home_score, away_score } = body;

  if (!session_id)       return fail("session_id é obrigatório");
  if (!assignments?.length) return fail("assignments vazio");

  const { data: session } = await db
    .from("game_sessions")
    .select("id, season_id, status")
    .eq("id", session_id)
    .single();
  if (!session) return fail("Sessão não encontrada", 404);

  const errors: string[] = [];
  let imported = 0;
  let skipped  = 0;

  // Replace mode: delete existing stats first
  if (mode === "replace") {
    const { error: delErr } = await db
      .from("player_game_stats")
      .delete()
      .eq("game_session_id", session_id);
    if (delErr) errors.push(`Aviso ao limpar stats anteriores: ${delErr.message}`);
  }

  // Upsert each assignment
  for (const a of assignments) {
    const s          = a.stats;
    const efficiency = calcEfficiency(s);
    const now        = new Date().toISOString();

    const rowData = {
      game_session_id:  session_id,
      season_id:        session.season_id,
      player_id:        a.player_id,
      pts:              s.pts,
      fg2_made:         s.fg2_made,
      fg2_att:          s.fg2_att,
      fg3_made:         s.fg3_made,
      fg3_att:          s.fg3_att,
      ft_made:          s.ft_made,
      ft_att:           s.ft_att,
      reb_off:          s.reb_off,
      reb_def:          s.reb_def,
      ast:              s.ast,
      stl:              s.stl,
      blk:              s.blk,
      tov:              s.tov,
      fouls_committed:  s.fouls_committed,
      fouls_drawn:      s.fouls_drawn,
      plus_minus:       s.plus_minus ?? 0,
      efficiency,
      seconds_played:   s.seconds_played,
      updated_at:       now,
    };

    const { error } = await db
      .from("player_game_stats")
      .upsert(rowData, { onConflict: "game_session_id,player_id" });

    if (error) {
      errors.push(`Erro ao guardar jogador ${a.player_id}: ${error.message}`);
      skipped++;
    } else {
      imported++;
    }
  }

  // Update game score
  if (update_score && (home_score !== null || away_score !== null)) {
    const scoreUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (home_score !== null) scoreUpdate.home_score = home_score;
    if (away_score !== null) scoreUpdate.away_score = away_score;
    await db.from("game_sessions").update(scoreUpdate).eq("id", session_id);
  }

  // Mark session as finished if it was still "scheduled"
  if (imported > 0 && session.status === "scheduled") {
    await db
      .from("game_sessions")
      .update({ status: "finished", updated_at: new Date().toISOString() })
      .eq("id", session_id);
  }

  const result: ConfirmResult = { imported, skipped, errors };
  return NextResponse.json({ result });
}
