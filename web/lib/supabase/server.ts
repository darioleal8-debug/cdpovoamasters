import type { SerializeOptions } from "cookie";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

type SupabaseCookiesToSet = {
  name: string;
  value: string;
  options: SerializeOptions;
}[];

// cache() deduplicates calls within the same React render tree so concurrent
// RSC requests share one client and avoid simultaneous token-refresh races.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: SupabaseCookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorado em Server Components (read-only)
          }
        },
      },
    }
  );
});

/**
 * Cliente com service role — bypassa RLS (base de dados e Storage).
 *
 * Usa createClient de @supabase/supabase-js sem cookies para que o service role
 * key seja sempre enviado como Authorization header (nunca substituído pelo JWT
 * da sessão do utilizador). Caso contrário, o Storage avalia RLS como utilizador
 * e rejeita uploads que requerem bypass de RLS.
 */
export async function createAdminClient() {
  const { createServiceClient } = await import("./service");
  return createServiceClient();
}
