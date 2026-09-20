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
}

/** Cliente com service role — apenas para uso em Route Handlers com acesso admin */
function stripBom(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

export async function createAdminClient() {
  const cookieStore = await cookies();

  return createServerClient(
    stripBom(process.env.NEXT_PUBLIC_SUPABASE_URL),
    stripBom(process.env.SUPABASE_SERVICE_ROLE_KEY),
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
          } catch {}
        },
      },
    }
  );
}
