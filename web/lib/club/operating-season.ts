import type { SupabaseClient } from "@supabase/supabase-js";
import { myClubId } from "@/lib/club/my-club-id";

/**
 * Época em que um clube opera sobre um jogo (plantel, convocatória, disponibilidade, live).
 *
 * Os jogos da Liga são um calendário único e todos têm a época do CD Póvoa (events.season_id). Um clube
 * que joga esse jogo (ex.: Aroso, Felgueiras) tem de usar o SEU plantel, ou seja, a sua época ativa.
 * Regra pura: se a época do evento é do próprio clube mantém-se; senão usa a época ativa do clube; se o clube
 * não tem época ativa devolve null (nunca a época de outro clube: não se expõe o plantel alheio).
 */
export function pickOperatingSeason(opts: {
  eventSeasonId: string | null;
  ownSeasonIds: ReadonlySet<string> | readonly string[];
  activeSeasonId: string | null;
}): string | null {
  const own = opts.ownSeasonIds instanceof Set ? opts.ownSeasonIds : new Set(opts.ownSeasonIds);
  if (opts.eventSeasonId && own.has(opts.eventSeasonId)) return opts.eventSeasonId;
  return opts.activeSeasonId ?? null;
}

/** Versão com BD: época de operação do clube `clubId` sobre um evento com `eventSeasonId` (sem clube, ex.: Master Admin → a do evento). */
export async function operatingSeasonForClub(
  supabase: SupabaseClient,
  clubId: string | null,
  eventSeasonId: string | null,
): Promise<string | null> {
  if (!clubId) return eventSeasonId;
  const { data } = await supabase
    .from("seasons").select("id, status, start_date").eq("club_id", clubId)
    .order("start_date", { ascending: false });
  const rows = (data ?? []) as { id: string; status: string }[];
  return pickOperatingSeason({
    eventSeasonId,
    ownSeasonIds: rows.map((r) => r.id),
    activeSeasonId: rows.find((r) => r.status === "ativa")?.id ?? null,
  });
}

/** Cliente (browser): época de operação do utilizador atual sobre o evento. */
export async function operatingSeasonId(
  supabase: SupabaseClient,
  eventSeasonId: string | null,
): Promise<string | null> {
  return operatingSeasonForClub(supabase, await myClubId(supabase), eventSeasonId);
}
