import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createActivationToken, activationLink as buildLink, TOKEN_TTL_MS } from "@/lib/activation-token";
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

// ─── POST /api/admin/users/activation-link ──────────────────
// Body: { userId: string; resendEmail?: boolean }
// Gera (ou regenera) um link de ativação para um jogador inativo.
// Funciona SEM base de dados graças a tokens HMAC.
export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  let body: { userId?: string; resendEmail?: boolean };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const { userId, resendEmail = false } = body;
  if (!userId) return fail("userId é obrigatório");

  const admin = adminClient();

  // Verificar permissão
  const { data: caller } = await admin
    .from("users").select("role").eq("id", authUser.id).single();

  if (!caller || !["admin", "treinador"].includes(caller.role)) {
    return fail("Sem permissão", 403);
  }

  // Verificar que o utilizador existe e é jogador
  const { data: target } = await admin
    .from("users")
    .select("id, email, name, active, role")
    .eq("id", userId)
    .single();

  if (!target) return fail("Utilizador não encontrado", 404);
  if (target.role !== "jogador") return fail("Apenas jogadores precisam de link de ativação", 400);
  if (target.active) return fail("A conta já está ativa. Não é necessário um link de ativação.", 400);

  // Gerar novo token HMAC
  const token = createActivationToken(userId);
  const link  = buildLink(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Guardar na BD (opcional)
  await admin
    .from("user_activation_tokens")
    .insert({ user_id: userId, token, expires_at: expiresAt });

  // Reenviar email se pedido
  let emailSent        = false;
  let emailDevFallback = false;
  let emailError: string | null = null;

  if (resendEmail) {
    const result = await sendActivationEmail({
      to:              target.email,
      name:            target.name,
      activationToken: token,
    });
    emailDevFallback = result.devFallback ?? false;
    emailSent        = result.success && !emailDevFallback;
    emailError       = result.error ?? null;
  }

  console.log(`[activation-link] Novo link para ${target.email}: ${link}`);

  return NextResponse.json({
    activationLink:  link,
    expiresAt,
    emailSent,
    emailDevFallback,
    emailError,
  });
}
