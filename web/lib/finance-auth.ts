import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { FINANCE } from "@/lib/auth/roles";

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
  // Sessão + perfil ativo procurado por id + papel em FINANCE (admin, tesoureiro)
  const auth = await authorize(FINANCE);
  if (!auth.ok) return auth;

  const admin = makeAdminClient();
  return { ok: true, userId: auth.user.id, role: auth.profile.role, admin };
}
