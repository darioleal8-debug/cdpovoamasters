/**
 * Cliente Supabase service-role sem cookies.
 *
 * Diferença face a createAdminClient() (server.ts):
 *  - Nunca lê nem escreve cookies → a Authorization header é sempre o service role key.
 *  - Bypassa todo o RLS (base de dados e Storage).
 *  - Não deve ser usado para operações que precisam de contexto de utilizador (usa createClient()).
 *
 * Usa import "server-only" para garantir que nunca é incluído no bundle do browser.
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function stripBom(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

export function createServiceClient() {
  return createSupabaseClient(
    stripBom(process.env.NEXT_PUBLIC_SUPABASE_URL),
    stripBom(process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
