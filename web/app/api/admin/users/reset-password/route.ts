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

  const { data: caller } = await admin
    .from("users").select("role").eq("id", authUser.id).single();

  if (caller?.role !== "admin") {
    return fail("Apenas o administrador pode repor passwords", 403);
  }

  const tempPassword = genTempPassword();

  const { error } = await admin.auth.admin.updateUserById(body.user_id, {
    password: tempPassword,
  });

  if (error) return fail(`Erro ao repor password: ${error.message}`, 500);

  return NextResponse.json({ success: true, temp_password: tempPassword });
}
