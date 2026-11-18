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

export interface ClubLeagueLink {
  name: string;
  href: string;
  /** true → site de outra liga (abre noutro separador); false → Liga INATEL dentro do HoopHub */
  external: boolean;
}

/**
 * Liga que o clube disputa, para o link "Site da Liga".
 * - clubs.league_url definido → essa liga (link externo);
 * - senão clubs.league_team_id definido → Liga INATEL (/liga-inatel);
 * - senão null (o clube não tem liga associada → sem link).
 */
export async function clubLeagueLink(db: Db, clubId: string): Promise<ClubLeagueLink | null> {
  const { data } = await db
    .from("clubs")
    .select("league_team_id, league_name, league_url")
    .eq("id", clubId)
    .maybeSingle();
  if (!data) return null;
  const url = typeof data.league_url === "string" ? data.league_url.trim() : "";
  if (/^https?:\/\//i.test(url)) {
    return { name: data.league_name?.trim() || "Site da Liga", href: url, external: true };
  }
  if (data.league_team_id) return { name: "Liga INATEL", href: "/liga-inatel", external: false };
  return null;
}
