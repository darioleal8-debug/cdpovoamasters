import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sendPasswordResetEmail } from "@/lib/email";

export const runtime = "nodejs";

// stripBom: necessário porque o .env.local pode ser guardado com BOM (Windows).
// Sem isto, a URL/key têm um char invisível que corrompe silenciosamente as queries à DB.
function stripBom(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function adminClient() {
  const url = stripBom(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = stripBom(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(url, key, {
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

function genTempPassword(): string {
  // Criptograficamente aleatória: sem ambiguidades (0/O, 1/I/l)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf   = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

// POST /api/admin/users/reset-password
export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  let body: { user_id?: string };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  if (!body.user_id) return fail("user_id é obrigatório");
  if (body.user_id === authUser.id) return fail("Não podes repor a tua própria password aqui");

  const admin = adminClient();

  // Verificar que o caller é admin (usando service role para contornar RLS)
  const { data: caller, error: callerError } = await admin
    .from("users").select("role, email").eq("id", authUser.id).single();

  if (callerError) {
    console.error(`[reset-password] Erro ao verificar role do caller (id=${authUser.id}):`, callerError.message);
  }

  if (caller?.role !== "admin") {
    console.warn(`[reset-password] Acesso negado — caller id=${authUser.id} email=${authUser.email} role=${caller?.role ?? "null"}`);
    return fail("Apenas o administrador pode repor passwords", 403);
  }

  // Verificar que o utilizador alvo existe
  const { data: target } = await admin
    .from("users")
    .select("id, email, name")
    .eq("id", body.user_id)
    .single();

  if (!target) return fail("Utilizador não encontrado", 404);

  // Gerar password temporária
  const tempPassword = genTempPassword();

  // 1. Atualizar password no Supabase Auth
  const { error: authError } = await admin.auth.admin.updateUserById(body.user_id, {
    password: tempPassword,
  });

  if (authError) {
    console.error(`[reset-password] Erro Supabase Auth para ${body.user_id}:`, authError.message);
    return fail(`Erro ao repor password: ${authError.message}`, 500);
  }

  // 2. Marcar utilizador para alterar password no próximo login
  await admin
    .from("users")
    .update({ must_change_password: true })
    .eq("id", body.user_id);

  console.log(`[reset-password] Password reposta para user_id=${body.user_id} (${target.email})`);

  // 3. Enviar email via Resend com a password temporária
  let emailSent        = false;
  let emailDevFallback = false;
  let emailError: string | null = null;

  try {
    const result = await sendPasswordResetEmail({
      to:           target.email,
      name:         target.name,
      email:        target.email,
      tempPassword,
    });
    emailDevFallback = result.devFallback ?? false;
    emailSent        = result.success && !emailDevFallback;
    emailError       = result.error ?? null;

    if (result.success) {
      console.log(`[reset-password] Email enviado para ${target.email} — id=${result.messageId ?? "dev"}`);
    } else {
      console.error(`[reset-password] Falha no email para ${target.email}:`, result.error);
    }
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error(`[reset-password] Exceção no email para ${target.email}:`, emailError);
  }

  // Resposta ao frontend — nunca expõe a password se o email foi enviado.
  // Se o email falhou, devolve a password como fallback para o admin partilhar manualmente.
  const response: Record<string, unknown> = {
    success:         true,
    email_sent:      emailSent,
    email_fallback:  emailDevFallback,
    email_error:     emailError,
    target_email:    target.email,
    target_name:     target.name,
  };

  if (!emailSent && !emailDevFallback) {
    // Email não enviado — o admin tem de partilhar a password manualmente
    response.temp_password = tempPassword;
  }

  return NextResponse.json(response);
}
