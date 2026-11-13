import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";
import { getOurTeamName } from "@/lib/competitions-data";
import {
  buildLiveLeagueResult, resolveOurSide,
  type LivePlay, type LivePlayerStat,
} from "@/lib/liga/live-build";

export type LivePublishResult =
  | { ok: true; eventId: string; isTest: boolean; homeScore: number; awayScore: number; withPeriods: boolean; players: number }
  | { ok: false; status: number; error: string };

/**
 * Assume o resultado e as estatísticas de um jogo registado ao vivo (já finalizado)
 * como resultado oficial da Liga INATEL: resultado, parciais e pontos por jogador
 * do CD Póvoa. Substitui submissões pendentes do mesmo jogo. Idempotente.
 *
 * Escreve com service role — o chamador tem de ter validado as permissões.
 */
export async function publishLiveSessionToLeague(sessionId: string, actorUserId: string): Promise<LivePublishResult> {
  const db = await createUnscopedAdminClient();

  const { data: session } = await db
    .from("game_sessions")
    .select("id, event_id, status, home_score, away_score, current_period")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, status: 404, error: "Jogo ao vivo não encontrado" };
  if (session.status !== "finished") return { ok: false, status: 409, error: "O jogo ainda não foi finalizado" };

  const [eventRes, compRes] = await Promise.all([
    db.from("events")
      .select("id, description, opponent, competition, season_id, is_test, deleted_at, game_type")
      .eq("id", session.event_id).maybeSingle(),
    db.from("competitions").select("id, competition_key").eq("slug", "liga-inatel").maybeSingle(),
  ]);
  const event = eventRes.data;
  if (!event || event.deleted_at) return { ok: false, status: 404, error: "Evento do jogo não encontrado" };
  const leagueKey = compRes.data?.competition_key ?? "Liga";
  if (event.competition !== leagueKey) {
    return { ok: false, status: 422, error: "Este jogo não pertence à Liga INATEL" };
  }
  if (event.game_type && event.game_type !== "official") {
    return { ok: false, status: 422, error: "Jogos de treino/amigáveis não contam para a liga" };
  }

  const meta = parseGameMeta(event.description ?? null);
  const isTest = event.is_test === true || meta?.is_test === true;
  const ourTeam = await getOurTeamName();
  const ourSide = resolveOurSide(meta, ourTeam);
  const homeName = meta?.home_team ?? (ourSide === "home" ? ourTeam : (event.opponent ?? "Adversário"));
  const awayName = meta?.away_team ?? (ourSide === "away" ? ourTeam : (event.opponent ?? "Adversário"));

  const [playsRes, statsRes] = await Promise.all([
    db.from("play_by_play")
      .select("period, is_home_team, points_delta, player_id, deleted_at")
      .eq("game_session_id", sessionId),
    db.from("player_game_stats")
      .select("player_id, pts, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, efficiency, seconds_played")
      .eq("game_session_id", sessionId),
  ]);
  const stats = (statsRes.data ?? []) as LivePlayerStat[];
  const ids = stats.map((s) => s.player_id);
  const [rosterRes, numbersRes] = await Promise.all([
    ids.length ? db.from("v_roster_public").select("player_id, name").in("player_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("players").select("id, number").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  const numberById = new Map(((numbersRes.data ?? []) as { id: string; number: number | null }[]).map((r) => [r.id, r.number]));
  const names = new Map(((rosterRes.data ?? []) as { player_id: string; name: string | null }[])
    .filter((r) => r.name)
    .map((r) => [r.player_id, { name: r.name as string, number: numberById.get(r.player_id) ?? null }]));

  const built = buildLiveLeagueResult({
    ourSide,
    ourScore: session.home_score,
    oppScore: session.away_score,
    plays: (playsRes.data ?? []) as LivePlay[],
    stats,
    names,
  });

  const { data: prev } = await db.from("league_game_results")
    .select("home_score, away_score").eq("event_id", event.id).maybeSingle();

  const [homeTeamRes, awayTeamRes] = await Promise.all([
    db.rpc("resolve_team_id", { p_name: homeName }),
    db.rpc("resolve_team_id", { p_name: awayName }),
  ]);
  const homeTeamId = (homeTeamRes.data as string | null) ?? null;
  const awayTeamId = (awayTeamRes.data as string | null) ?? null;

  const { error: resErr } = await db.from("league_game_results").upsert({
    event_id: event.id,
    competition_id: isTest ? null : (compRes.data?.id ?? null),
    home_team_name: homeName,
    away_team_name: awayName,
    home_score: built.homeScore,
    away_score: built.awayScore,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    jornada: meta?.jornada ?? null,
    volta: meta?.volta ?? null,
    approved_at: new Date().toISOString(),
    approved_by: actorUserId,
    overtime: built.overtime,
    source_submission_id: null,
    home_unattributed_points: built.unattributed.home,
    away_unattributed_points: built.unattributed.away,
    stats_completeness: "partial",
  }, { onConflict: "event_id" });
  if (resErr) return { ok: false, status: 500, error: `Erro ao gravar o resultado: ${resErr.message}` };

  if (built.periods) {
    await db.from("league_game_periods").delete().eq("event_id", event.id);
    await db.from("league_game_periods").insert(built.periods.map((p) => ({ event_id: event.id, ...p })));
  }

  // Só as linhas do CD Póvoa são substituídas (mantém dados do adversário vindos da folha de jogo)
  await db.from("league_game_player_stats").delete().eq("event_id", event.id).eq("side", ourSide);
  if (built.players.length) {
    const ourTeamId = ourSide === "home" ? homeTeamId : awayTeamId;
    const { error: plErr } = await db.from("league_game_player_stats").insert(
      built.players.map((p) => ({ event_id: event.id, team_id: ourTeamId, ...p }))
    );
    if (plErr) console.error(`[live-publish] jogadores: ${plErr.message}`);
  }

  // Submissões pendentes do mesmo jogo ficam substituídas pela estatística live
  await db.from("result_submissions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: actorUserId,
      rejection_reason: "Resultado assumido da estatística registada ao vivo no HoopHub",
    })
    .eq("event_id", event.id)
    .eq("status", "pending");

  await db.from("liga_resultado_audit").insert({
    jogo_id: event.id,
    alterado_por: actorUserId,
    valor_antigo: prev ?? null,
    valor_novo: {
      home_score: built.homeScore, away_score: built.awayScore,
      source: `live:${sessionId}`, is_test: isTest, completeness: "partial",
    },
    motivo: "Resultado e estatísticas assumidos do registo ao vivo (HoopHub live)",
  });

  // Marcadores "Vencedor Jogo N" em jogos futuros (taça/play-off)
  if (!isTest && meta?.jogo_num && event.season_id && built.homeScore !== built.awayScore) {
    const placeholder = `Vencedor Jogo ${meta.jogo_num}`;
    const winner = built.homeScore > built.awayScore ? homeName : awayName;
    const { data: futureEvents } = await db.from("events")
      .select("id, description, opponent")
      .eq("season_id", event.season_id).eq("game_type", "official").neq("id", event.id);
    for (const fe of futureEvents ?? []) {
      if (!fe.description) continue;
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(fe.description as string); } catch { continue; }
      let changed = false;
      if (parsed.home_team === placeholder) { parsed.home_team = winner; changed = true; }
      if (parsed.away_team === placeholder) { parsed.away_team = winner; changed = true; }
      if (changed) {
        const updates: { description: string; opponent?: string } = { description: JSON.stringify(parsed) };
        if ((fe.opponent as string | null) === placeholder) updates.opponent = winner;
        await db.from("events").update(updates).eq("id", fe.id);
      }
    }
  }

  return {
    ok: true, eventId: event.id, isTest,
    homeScore: built.homeScore, awayScore: built.awayScore,
    withPeriods: !!built.periods, players: built.players.length,
  };
}
