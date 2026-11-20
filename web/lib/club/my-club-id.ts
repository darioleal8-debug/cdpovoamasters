import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Clube principal (mais antigo, ativo) do utilizador autenticado — versão para o browser.
 * Espelha `clubIdForUser` (server-only). Necessário porque o RLS dá ao Master Admin as temporadas
 * de TODOS os clubes: sem filtrar por clube, "a temporada ativa" fica ambígua.
 * Lê `club_members` pela política `club_members_select_self`.
 */
export async function myClubId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("club_members")
    .select("club_id, clubs!inner(active)")
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("clubs.active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.club_id as string | undefined) ?? null;
}
