import "server-only";
import type { createRawServiceClient } from "@/lib/supabase/service-raw";

type AdminDb = ReturnType<typeof createRawServiceClient>;

export type LinkResult = { ok: true; alreadyLinked?: boolean } | { ok: false; status: number; error: string };

const conflict = (error: string): LinkResult => ({ ok: false, status: 409, error });

/** O Supabase devolve code "email_exists"; a mensagem varia ("already been registered" / "already registered"). */
export function isEmailExistsError(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === "email_exists" || /already (been )?registered/i.test(e.message ?? ""));
}

/** Procura uma conta no Auth pelo email (a API admin não tem pesquisa por email; pagina a lista). */
export async function findAuthUserByEmail(admin: AdminDb, email: string): Promise<{ id: string; email: string } | null> {
  const target = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit?.email) return { id: hit.id, email: hit.email };
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * App de gestão → associa uma conta que JÁ existe (ex.: criada como delegado na Liga) a um clube.
 * Mesma conta nas duas apps: o clube liga-se à equipa da Liga através de clubs.league_team_id.
 *
 * Regras de segurança (a conta existente mantém a password):
 *  - não pode já pertencer a outro clube (um utilizador = um clube);
 *  - se for delegada de uma equipa da Liga, essa equipa tem de ser a do clube.
 */
export async function linkExistingAccountToClub(
  admin: AdminDb,
  p: { userId: string; email: string; name: string; role: string; clubId: string },
): Promise<LinkResult> {
  const { data: club } = await admin.from("clubs").select("id, league_team_id").eq("id", p.clubId).maybeSingle();
  if (!club) return { ok: false, status: 404, error: "Clube não encontrado" };

  const { data: memberships } = await admin.from("club_members").select("club_id").eq("user_id", p.userId);
  if ((memberships ?? []).some((m) => m.club_id !== p.clubId)) {
    return conflict("Esta conta já pertence a outro clube.");
  }

  const { data: teams } = await admin.from("league_team_members").select("team_id").eq("user_id", p.userId);
  if ((teams ?? []).length > 0 && !(teams ?? []).some((t) => t.team_id === club.league_team_id)) {
    return conflict("Esta conta é delegada de uma equipa da Liga que não está associada a este clube.");
  }

  const { data: profile } = await admin.from("users").select("id").eq("id", p.userId).maybeSingle();
  let createdProfile = false;
  if (!profile) {
    const { error } = await admin.from("users").insert({
      id: p.userId, email: p.email, name: p.name, role: p.role, roles_extra: [], active: true, status: "ativo",
    });
    if (error) return { ok: false, status: 500, error: `Erro ao criar perfil: ${error.message}` };
    createdProfile = true;
    // O trigger de novos utilizadores pode associá-lo ao clube único ativo: garantir só este clube.
    await admin.from("club_members").delete().eq("user_id", p.userId).neq("club_id", p.clubId);
  }

  const { error: memErr } = await admin
    .from("club_members").upsert({ club_id: p.clubId, user_id: p.userId, role: p.role, active: true }, { onConflict: "club_id,user_id" });
  if (memErr) {
    if (createdProfile) await admin.from("users").delete().eq("id", p.userId);
    return { ok: false, status: 500, error: `Erro ao associar ao clube: ${memErr.message}` };
  }
  return { ok: true, alreadyLinked: (memberships ?? []).length > 0 };
}

/**
 * Liga → associa uma conta que JÁ existe (ex.: administrador de clube na app de gestão) como delegado de uma equipa.
 *
 * Regras de segurança:
 *  - uma conta só pode ser delegada de uma equipa;
 *  - se já pertencer a um clube, esse clube tem de estar ligado a esta equipa (clubs.league_team_id).
 */
export async function linkExistingAccountToTeam(
  admin: AdminDb,
  p: { userId: string; teamId: string; createdBy: string },
): Promise<LinkResult> {
  const { data: teams } = await admin.from("league_team_members").select("team_id").eq("user_id", p.userId);
  if ((teams ?? []).some((t) => t.team_id === p.teamId)) return { ok: true, alreadyLinked: true };
  if ((teams ?? []).length > 0) return conflict("Esta conta já é delegada de outra equipa da Liga.");

  const { data: memberships } = await admin.from("club_members").select("club_id").eq("user_id", p.userId);
  const clubIds = (memberships ?? []).map((m) => m.club_id as string);
  if (clubIds.length > 0) {
    const { data: clubs } = await admin.from("clubs").select("id, league_team_id").in("id", clubIds);
    if ((clubs ?? []).some((c) => c.league_team_id !== p.teamId)) {
      return conflict("Esta conta pertence a um clube da app de gestão que não está associado a esta equipa.");
    }
  }

  const { error } = await admin.from("league_team_members").insert({
    user_id: p.userId, team_id: p.teamId, role: "delegate", created_by: p.createdBy,
  });
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}
