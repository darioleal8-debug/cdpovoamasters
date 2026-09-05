import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// POST /api/auth/change-password
// Altera a password do utilizador autenticado e limpa o flag must_change_password.
export async function POST(req: NextRequest) {
  let body: { new_password?: string };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  if (!body.new_password || body.new_password.length < 8) {
    return fail("A nova password deve ter pelo menos 8 caracteres");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // Verificar sessão ativa
  const { data: { user }, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !user) {
    return fail("Sessão expirada. Faz login novamente.", 401);
  }

  // Atualizar password via sessão do utilizador
  const { error: updateError } = await supabase.auth.updateUser({
    password: body.new_password,
  });

  if (updateError) {
    console.error(`[change-password] Erro ao atualizar password para ${user.id}:`, updateError.message);
    return fail(`Erro ao alterar password: ${updateError.message}`, 500);
  }

  // Limpar flag must_change_password via service role
  await adminClient()
    .from("users")
    .update({ must_change_password: false })
    .eq("id", user.id);

  console.log(`[change-password] Password alterada com sucesso para user_id=${user.id}`);

  return NextResponse.json({ success: true });
}
