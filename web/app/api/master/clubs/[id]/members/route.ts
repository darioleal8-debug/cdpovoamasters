import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ROLES = ["admin", "treinador", "seccionista", "tesoureiro"] as const;

// GET /api/master/clubs/:id/members
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { id } = await params;

  const { data: rows, error } = await m.admin
    .from("club_members").select("user_id, role, active, created_at").eq("club_id", id).order("created_at");
  if (error) return fail(error.message, 500);
  const ids = (rows ?? []).map((r) => r.user_id);
  const { data: users } = ids.length
    ? await m.admin.from("users").select("id, name, email").in("id", ids)
    : { data: [] as { id: string; name: string | null; email: string }[] };
  const byId = new Map((users ?? []).map((u) => [u.id, u]));
  return NextResponse.json({
    members: (rows ?? []).map((r) => ({ ...r, name: byId.get(r.user_id)?.name ?? null, email: byId.get(r.user_id)?.email ?? null })),
  });
}

// POST /api/master/clubs/:id/members { name, email, password, role }
// Cria a conta (Auth + perfil) e associa SÓ a este clube.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { admin } = m;
  const { id: clubId } = await params;

  let body: { name?: string; email?: string; password?: string; role?: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const role = (body.role ?? "admin") as (typeof ROLES)[number];
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) return fail("Nome e email válidos são obrigatórios");
  if (password.length < 10) return fail("A password deve ter pelo menos 10 caracteres");
  if (!ROLES.includes(role)) return fail("Papel inválido");

  const { data: club } = await admin.from("clubs").select("id").eq("id", clubId).maybeSingle();
  if (!club) return fail("Clube não encontrado", 404);

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (authErr) {
    return authErr.message.includes("already registered")
      ? fail("Este email já tem uma conta registada", 409)
      : fail(`Erro ao criar utilizador: ${authErr.message}`, 500);
  }
  const userId = created.user.id;

  const { error: profErr } = await admin.from("users").insert({ id: userId, email, name, role, roles_extra: [], active: true });
  if (profErr) {
    await admin.auth.admin.deleteUser(userId);
    return fail(`Erro ao criar perfil: ${profErr.message}`, 500);
  }

  // O trigger de novos utilizadores pode tê-lo associado ao clube único ativo: garantir só este clube.
  await admin.from("club_members").delete().eq("user_id", userId).neq("club_id", clubId);
  const { error: memErr } = await admin
    .from("club_members").upsert({ club_id: clubId, user_id: userId, role, active: true }, { onConflict: "club_id,user_id" });
  if (memErr) {
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return fail(`Erro ao associar ao clube: ${memErr.message}`, 500);
  }
  return NextResponse.json({ member: { user_id: userId, name, email, role, active: true } }, { status: 201 });
}
