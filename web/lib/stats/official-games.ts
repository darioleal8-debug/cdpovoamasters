import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * As estatísticas de jogo (pontos, ressaltos, assiduidade a jogos, etc.)
 * só contabilizam jogos OFICIAIS: game_type = 'official', não-teste e não
 * eliminados. Jogos de treino/amigáveis continuam a existir no calendário e
 * a guardar o resultado e as stats próprias, mas ficam fora dos totais.
 */
export async function getOfficialGameEventIds(
  db: SupabaseClient,
  seasonId: string,
  competition?: string,
): Promise<string[]> {
  let q = db
    .from("events")
    .select("id")
    .eq("season_id", seasonId)
    .eq("type", "jogo")
    .eq("game_type", "official")
    .eq("is_test", false)
    .is("deleted_at", null);
  if (competition) q = q.eq("competition", competition);

  const { data } = await q;
  return (data ?? []).map((e) => e.id as string);
}

/** Sessões de jogo (game_sessions.id) de jogos oficiais da época. */
export async function getOfficialGameSessionIds(
  db: SupabaseClient,
  seasonId: string,
  opts: { competition?: string; finishedOnly?: boolean } = {},
): Promise<string[]> {
  const eventIds = await getOfficialGameEventIds(db, seasonId, opts.competition);
  if (eventIds.length === 0) return [];

  let q = db
    .from("game_sessions")
    .select("id")
    .in("event_id", eventIds)
    .neq("stats_source", "result_only");
  if (opts.finishedOnly) q = q.eq("status", "finished");

  const { data } = await q;
  return (data ?? []).map((s) => s.id as string);
}
