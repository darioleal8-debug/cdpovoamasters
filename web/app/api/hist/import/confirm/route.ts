import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { HistConfirmPayload, HistConfirmResult } from "@/lib/hist-importer/types";

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

function canonicalize(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
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

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const db = adminClient();
  const { data: profile } = await db.from("users").select("role").eq("id", authUser.id).single();
  if (!profile || !["admin", "treinador"].includes(profile.role)) return fail("Sem permissão", 403);

  let body: HistConfirmPayload;
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const { hist_season_id, game_meta, pdf_filename, assignments } = body;
  if (!hist_season_id)      return fail("hist_season_id é obrigatório");
  if (!assignments?.length) return fail("assignments vazio");

  const { data: season } = await db.from("hist_seasons").select("id").eq("id", hist_season_id).single();
  if (!season) return fail("Temporada não encontrada", 404);

  const errors: string[] = [];
  let newPlayers = 0;

  // Resolve/create hist_players for each assignment
  const resolvedAssignments: Array<{ hist_player_id: string; jersey_number: number | null; stats: (typeof assignments)[0]["stats"] }> = [];

  for (const a of assignments) {
    let playerId = a.hist_player_id;

    if (!playerId) {
      // Create new hist_player
      const name = (a.new_player_name ?? "").trim();
      if (!name) { errors.push("Jogador sem nome ignorado"); continue; }
      const { data: created, error: createErr } = await db
        .from("hist_players")
        .insert({ name, canonical_name: canonicalize(name) })
        .select("id")
        .single();
      if (createErr) { errors.push(`Erro ao criar ${name}: ${createErr.message}`); continue; }
      playerId = created.id;
      newPlayers++;
    }
    if (!playerId) { errors.push("player_id não resolvido"); continue; }
    resolvedAssignments.push({ hist_player_id: playerId, jersey_number: a.jersey_number, stats: a.stats });
  }

  // Create hist_game
  const { data: game, error: gameErr } = await db
    .from("hist_games")
    .insert({
      hist_season_id,
      game_date:     game_meta.game_date ?? null,
      opponent_name: game_meta.opponent_name ?? null,
      home_score:    game_meta.home_score ?? null,
      away_score:    game_meta.away_score ?? null,
      competition:   game_meta.competition ?? null,
      pdf_filename:  pdf_filename ?? null,
      imported_by:   authUser.id,
    })
    .select("id")
    .single();

  if (gameErr || !game) {
    return fail(`Erro ao criar jogo: ${gameErr?.message ?? "unknown"}`, 500);
  }

  // Upsert hist_player_stats
  let imported = 0, skipped = 0;

  for (const ra of resolvedAssignments) {
    const s = ra.stats;
    const efficiency = calcEfficiency(s);

    const { error } = await db.from("hist_player_stats").upsert({
      hist_game_id:    game.id,
      hist_player_id:  ra.hist_player_id,
      hist_season_id,
      jersey_number:   ra.jersey_number ?? null,
      seconds_played:  s.seconds_played,
      fg2_made:        s.fg2_made,   fg2_att: s.fg2_att,
      fg3_made:        s.fg3_made,   fg3_att: s.fg3_att,
      ft_made:         s.ft_made,    ft_att:  s.ft_att,
      reb_off:         s.reb_off,    reb_def: s.reb_def,
      ast:             s.ast,        stl:     s.stl,
      blk:             s.blk,        tov:     s.tov,
      fouls_committed: s.fouls_committed,
      fouls_drawn:     s.fouls_drawn,
      pts:             s.pts,
      plus_minus:      s.plus_minus ?? 0,
      efficiency,
    }, { onConflict: "hist_game_id,hist_player_id" });

    if (error) { errors.push(`Stats ${ra.hist_player_id}: ${error.message}`); skipped++; }
    else imported++;
  }

  const result: HistConfirmResult = {
    hist_game_id: game.id,
    imported,
    new_players:  newPlayers,
    skipped,
    errors,
  };
  return NextResponse.json({ result }, { status: 201 });
}
