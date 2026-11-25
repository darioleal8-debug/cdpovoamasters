import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { operatingSeasonForClub } from "@/lib/club/operating-season";

/**
 * Contexto em que o utilizador opera sobre um jogo do calendário único da Liga:
 * - clubId: o clube dono do jogo se o utilizador pertence a ele; senão o seu clube principal (mais antigo);
 * - seasonId: a época do jogo se for do clube, senão a época ativa do clube (o plantel que convoca/joga).
 * Os jogos da Liga têm a época do CD Póvoa; os outros clubes nunca devem operar sobre ela.
 */
export async function gameContextForUser(
  db: SupabaseClient,
  userId: string,
  event: { season_id: string | null; club_id: string | null },
): Promise<{ clubId: string | null; seasonId: string | null }> {
  const { data } = await db
    .from("club_members")
    .select("club_id, clubs!inner(active)")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("clubs.active", true)
    .order("created_at", { ascending: true });
  const mine = ((data ?? []) as { club_id: string }[]).map((r) => r.club_id);
  const clubId = event.club_id && mine.includes(event.club_id) ? event.club_id : (mine[0] ?? null);
  const seasonId = await operatingSeasonForClub(db, clubId, event.season_id);
  return { clubId, seasonId };
}
