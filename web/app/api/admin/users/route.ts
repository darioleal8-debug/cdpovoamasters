import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createActivationToken, activationLink as buildLink } from "@/lib/activation-token";
import { sendActivationEmail } from "@/lib/email";

export const runtime = "nodejs";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ─── Validações ───────────────────────────────────────────

const PHONE_RE      = /^(\+351)?[0-9]{9}$/;
const BIRTH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validatePhone(phone: string): string | null {
  if (!PHONE_RE.test(phone.replace(/\s+/g, ""))) {
    return "Telemóvel inválido. Usa 9 dígitos ou +351 seguido de 9 dígitos.";
  }
  return null;
}

function validateBirthDate(dateStr: string): string | null {
  if (!BIRTH_DATE_RE.test(dateStr)) return "Data de nascimento inválida (formato YYYY-MM-DD).";
  const ageYears = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears < 16)  return "O jogador deve ter pelo menos 16 anos.";
  if (ageYears > 100) return "Data de nascimento inválida.";
  return null;
}

// ─── GET /api/admin/users ─────────────────────────────────
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const admin = adminClient();

  const { data: caller } = await admin
    .from("users").select("role").eq("id", authUser.id).single();

  if (!caller || !["admin", "treinador"].includes(caller.role)) {
    return fail("Sem permissão", 403);
  }

  const { data: users, error } = await admin
    .from("users")
    .select("id, email, name, role, phone, birth_date, photo_url, active, created_at")
    .order("created_at", { ascending: false });

  if (error) return fail(error.message, 500);

  // Enriquecer com dados do jogador associado
  const userIds = (users ?? []).map((u) => u.id as string);
  let playerMap: Record<string, Record<string, unknown>> = {};
  if (userIds.length > 0) {
    const { data: playerRows } = await admin
      .from("players")
      .select("id, name, user_id, number, position, season_id")
      .in("user_id", userIds);
    for (const p of playerRows ?? []) {
      if (p.user_id) playerMap[p.user_id as string] = p as Record<string, unknown>;
    }
  }

  const enriched = (users ?? []).map((u) => ({
    ...u,
    player: playerMap[u.id] ?? null,
  }));

  return NextResponse.json({ users: enriched });
}

// ─── POST /api/admin/users ────────────────────────────────
export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  let body: Record<string, string>;
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const {
    name, email, password,
    role = "jogador",
    phone, birth_date,
    season_id, jersey_number, position, height, weight,
  } = body;

  // ── Validações base ──────────────────────────────────────
  if (!name?.trim())     return fail("Nome é obrigatório");
  if (!email?.trim())    return fail("Email é obrigatório");
  if (!password?.trim()) return fail("Password é obrigatória");
  if (password.length < 6) return fail("Password deve ter pelo menos 6 caracteres");
  if (!["admin", "treinador", "jogador"].includes(role)) return fail("Role inválido");

  // ── Validações para jogadores ────────────────────────────
  if (role === "jogador") {
    if (!season_id)          return fail("Temporada é obrigatória para jogadores");
    if (!phone?.trim())      return fail("Telemóvel é obrigatório para jogadores");
    if (!birth_date?.trim()) return fail("Data de nascimento é obrigatória para jogadores");
  }

  if (phone?.trim()) {
    const err = validatePhone(phone.trim());
    if (err) return fail(err);
  }
  if (birth_date?.trim()) {
    const err = validateBirthDate(birth_date.trim());
    if (err) return fail(err);
  }

  const admin = adminClient();

  const { data: caller } = await admin
    .from("users").select("role").eq("id", authUser.id).single();

  if (!caller || !["admin", "treinador"].includes(caller.role)) {
    return fail("Sem permissão — apenas admin ou treinador podem criar contas", 403);
  }
  if (caller.role === "treinador" && role !== "jogador") {
    return fail("Treinadores só podem criar contas de jogador", 403);
  }

  // ── Criar utilizador Auth ────────────────────────────────
  const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
    email: email.trim(),
    password: password.trim(),
    email_confirm: true,
    user_metadata: { name: name.trim() },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return fail("Este email já tem uma conta registada", 409);
    }
    return fail(`Erro ao criar utilizador: ${authError.message}`, 500);
  }

  const newUserId = newAuthUser.user.id;

  // ── Criar perfil em public.users ─────────────────────────
  const profilePayload: Record<string, unknown> = {
    id: newUserId, email: email.trim(), name: name.trim(), role,
    // Jogadores começam inativos — precisam de ativar via email
    active: role === "jogador" ? false : true,
  };
  if (phone?.trim())      profilePayload.phone      = phone.trim().replace(/\s+/g, "");
  if (birth_date?.trim()) profilePayload.birth_date = birth_date.trim();

  const { error: profileError } = await admin.from("users").insert(profilePayload);

  if (profileError) {
    await admin.auth.admin.deleteUser(newUserId);
    return fail(`Erro ao criar perfil: ${profileError.message}`, 500);
  }

  // ── Criar registo de jogador automaticamente ─────────────
  let playerRecord = null;
  let playerCreationError: string | null = null;

  if (role === "jogador" && season_id) {
    const playerPayload: Record<string, unknown> = {
      name:     name.trim(),
      season_id,
      user_id:  newUserId,
    };
    if (phone?.trim())          playerPayload.phone      = phone.trim().replace(/\s+/g, "");
    if (birth_date?.trim())     playerPayload.birth_date = birth_date.trim();
    if (jersey_number?.trim())  playerPayload.number     = Number(jersey_number);
    if (position?.trim())       playerPayload.position   = position.trim();
    if (height?.trim())         playerPayload.height     = Number(height);
    if (weight?.trim())         playerPayload.weight     = Number(weight);

    const { data: newPlayer, error: playerError } = await admin
      .from("players")
      .insert(playerPayload)
      .select()
      .single();

    if (playerError) {
      // 23505 = unique_violation em uq_player_name_season — já existe
      // um jogador com este nome nesta temporada (ex: criado manualmente
      // em /jogadores). Em vez de falhar, ligamos a esse registo.
      if (playerError.code === "23505") {
        const { data: linked, error: linkError } = await admin
          .from("players")
          .update({
            user_id: newUserId,
            ...(jersey_number?.trim() ? { number: Number(jersey_number) } : {}),
            ...(position?.trim()      ? { position: position.trim() }    : {}),
          })
          .eq("name", name.trim())
          .eq("season_id", season_id)
          .is("user_id", null)
          .select()
          .single();

        if (linkError || !linked) {
          playerCreationError =
            "Já existe um jogador com este nome nesta temporada, associado a outra conta. " +
            "Liga manualmente em Gestão de Jogadores.";
          console.error("[api/admin/users] Conflito ao ligar jogador:", linkError?.message ?? playerError.message);
        } else {
          playerRecord = linked;
          console.log("[api/admin/users] Jogador existente ligado à nova conta:", linked.id);
        }
      } else {
        playerCreationError = playerError.message;
        console.error("[api/admin/users] Erro ao criar jogador:", playerError.message);
      }
    } else {
      playerRecord = newPlayer;
    }
  }

  // ── Token de ativação (apenas para jogadores) ────────────
  let link: string | null = null;
  let emailSent           = false;
  let emailDevFallback    = false;
  let emailError: string | null = null;

  if (role === "jogador") {
    // Token HMAC auto-contido — funciona SEM base de dados
    const token = createActivationToken(newUserId);
    link = buildLink(token);

    // Tentar guardar na BD de auditoria (opcional — falha silenciosamente se tabela não existir)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: tokenDbError } = await admin
      .from("user_activation_tokens")
      .insert({ user_id: newUserId, token, expires_at: expiresAt });

    if (tokenDbError) {
      // Esperado se a migração 017 ainda não foi aplicada — não é bloqueante
      console.warn("[api/admin/users] Token DB save skipped:", tokenDbError.message);
    }

    // Tentar enviar email — devolve o erro real se a configuração
    // existir mas falhar (ex: domínio não verificado no Resend)
    const emailResult = await sendActivationEmail({
      to:              email.trim(),
      name:            name.trim(),
      activationToken: token,
    });
    emailDevFallback = emailResult.devFallback ?? false;
    emailSent        = emailResult.success && !emailDevFallback;
    emailError       = emailResult.error ?? null;

    // Log do link sempre — admin pode ver no terminal mesmo sem email
    console.log(`[api/admin/users] Link de ativação para ${email.trim()}:`);
    console.log(`  ${link}`);
  }

  return NextResponse.json({
    success: true,
    user:    { id: newUserId, email: email.trim(), name: name.trim(), role },
    player:  playerRecord,
    playerError: playerCreationError,
    activation: role === "jogador"
      ? { activationLink: link, emailSent, emailDevFallback, emailError }
      : null,
  }, { status: 201 });
}

// ─── PATCH /api/admin/users ───────────────────────────────
export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const { user_id, role, active, name } = body as {
    user_id?: string; role?: string; active?: boolean; name?: string;
  };
  if (!user_id) return fail("user_id é obrigatório");

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("role").eq("id", authUser.id).single();

  if (caller?.role !== "admin") {
    return fail("Apenas o administrador pode alterar contas", 403);
  }

  const updates: Record<string, unknown> = {};
  if (name  !== undefined && String(name).trim()) updates.name   = String(name).trim();
  if (role  !== undefined) {
    if (!["admin", "treinador", "jogador"].includes(String(role))) return fail("Role inválido");
    updates.role = role;
  }
  if (active !== undefined) updates.active = Boolean(active);
  if (Object.keys(updates).length === 0) return fail("Nenhum campo para actualizar");

  const { error } = await admin.from("users").update(updates).eq("id", user_id);
  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true });
}

// ─── DELETE /api/admin/users ──────────────────────────────
export async function DELETE(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("id");
  if (!userId) return fail("id é obrigatório");
  if (userId === authUser.id) return fail("Não podes eliminar a tua própria conta", 400);

  const admin = adminClient();
  const { data: caller } = await admin
    .from("users").select("role").eq("id", authUser.id).single();

  if (caller?.role !== "admin") return fail("Apenas o administrador pode eliminar contas", 403);

  // Verificar que o utilizador existe antes de tentar eliminar
  const { data: target } = await admin
    .from("users").select("id, email").eq("id", userId).single();

  if (!target) return fail("Utilizador não encontrado", 404);

  // Conta master — imutável, independentemente de quem pede
  const MASTER_EMAIL = "darioleal8@gmail.com";
  if ((target.email as string) === MASTER_EMAIL) {
    return fail("Esta conta não pode ser eliminada.", 403);
  }

  // ── Eliminação em cascata explícita ───────────────────────
  // Necessário porque public.users pode não ter ON DELETE CASCADE
  // ligado a auth.users (tabela criada antes da migração 011).

  // 1. Eliminar jogador(es) associados a este utilizador
  //    (ON DELETE CASCADE em players.user_id pode não estar aplicado)
  await admin.from("players").delete().eq("user_id", userId);

  // 2. Eliminar perfil em public.users
  //    Este é o passo que faltava e causava o bug de "conta continua na lista"
  const { error: profileError } = await admin
    .from("users").delete().eq("id", userId);

  if (profileError) {
    return fail(`Erro ao eliminar perfil: ${profileError.message}`, 500);
  }

  // 3. Eliminar utilizador do Supabase Auth
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    // Se auth delete falhar, o perfil já foi eliminado — aceitável.
    // O utilizador não conseguirá autenticar mas também não aparece na lista.
    console.error("[DELETE /api/admin/users] Auth delete failed:", authError.message);
  }

  return NextResponse.json({ success: true, message: "Conta eliminada." });
}
