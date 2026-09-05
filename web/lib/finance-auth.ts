import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { FINANCE_ROLES } from "@/lib/finance-constants";

// Remove BOM (U+FEFF = 65279) do inicio de env vars — pode aparecer quando
// a chave foi copiada/colada a partir de fontes com encoding UTF-8 com BOM.
function sanitizeEnv(value: string | undefined): string {
  const s = (value ?? "").trim();
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function makeAdminClient() {
  return createSupabaseClient(
    sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export type AdminClient = ReturnType<typeof makeAdminClient>;

export async function requireFinanceAccess(): Promise<
  | { ok: true;  userId: string; role: string; admin: AdminClient }
  | { ok: false; response: NextResponse }
> {
  const fail = (msg: string, status: number) => ({
    ok: false as const,
    response: NextResponse.json({ error: msg }, { status }),
  });

  // Mesmo padrão do dashboard layout — cliente com cookies
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  // Query por email — igual ao dashboard layout
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("email", user.email!)
    .single();

  if (!profile || !(FINANCE_ROLES as readonly string[]).includes(profile.role)) {
    return fail("Sem permissão — área exclusiva para Administrador e Tesoureiro", 403);
  }

  const admin = makeAdminClient();
  return { ok: true, userId: user.id, role: profile.role, admin };
}
