import "server-only";

/** Cliente com acesso às tabelas (service role ou sessão). */
type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Clube principal (mais antigo) de um utilizador ativo. null se não pertencer a nenhum. */
export async function clubIdForUser(db: Db, userId: string): Promise<string | null> {
  const { data } = await db
    .from("club_members")
    .select("club_id")
    .eq("user_id", userId)
    .eq("active", true)
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
