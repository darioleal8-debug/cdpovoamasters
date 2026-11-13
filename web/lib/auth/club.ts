import "server-only";

/** Cliente com acesso às tabelas (service role ou sessão). */
type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Clube principal (mais antigo) de um utilizador ativo. null se não pertencer a nenhum. */
export async function clubIdForUser(db: Db, userId: string): Promise<string | null> {
  const { data } = await db
    .from("club_members")
    .select("club_id, clubs!inner(active)")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("clubs.active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.club_id as string | undefined) ?? null;
}

/** club_id de uma linha existente (ex.: treino, jogador) — herdar em registos filhos. */
export async function clubIdOfRow(db: Db, table: string, id: string): Promise<string | null> {
  const { data } = await db.from(table).select("club_id").eq("id", id).maybeSingle();
  return (data?.club_id as string | undefined) ?? null;
}

/** Nome da equipa da Liga associada ao clube (clubs.league_team_id); null se não houver. */
export async function leagueTeamNameForClub(db: Db, clubId: string): Promise<string | null> {
  const { data } = await db.from("clubs").select("league_teams(name)").eq("id", clubId).maybeSingle();
  const lt = data?.league_teams as { name?: string } | { name?: string }[] | null | undefined;
  return (Array.isArray(lt) ? lt[0]?.name : lt?.name) ?? null;
}
