import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Cliente Supabase anónimo, SEM a sessão do visitante.
 *
 * Usar para leituras de conteúdo público (notícias, estatísticas de jogos publicadas…).
 * O cliente de `server.ts` envia o token da sessão em cookie; quando esse token está
 * expirado (comum em telemóveis com sessões longas) o PostgREST responde 401 e a
 * página fica vazia. Conteúdo público não deve depender da sessão de quem o lê.
 */
export function createPublicClient(): SupabaseClient {
  if (!client) {
    client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return client;
}
