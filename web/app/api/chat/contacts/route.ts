import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { authorize } from "@/lib/auth/guards";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function adminClient() {
  return createServiceClient(); // isolado por clube (ver lib/supabase/club-scope.ts)
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

// ─── GET /api/chat/contacts ─────────────────────────────────
// Lista de utilizadores com quem o caller pode iniciar uma nova conversa,
// filtrada pela matriz de permissões por role.
export async function GET() {
  // Sessão + conta ativa (revisão final, Crítico 1); as verificações de papel abaixo mantêm-se
  const authz = await authorize();
  if (!authz.ok) return authz.response;
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const admin = adminClient();
  const caller = authz.profile; // papel ativo (authorize)
  if (!caller) return fail("Perfil não encontrado", 404);

  let query = admin
    .from("users")
    .select("id, name, role, photo_url")
    .eq("active", true)
    .neq("id", caller.id);

  if (caller.role === "jogador") {
    query = query.in("role", ["jogador", "treinador", "admin"]);
  } else if (caller.role === "treinador") {
    query = query.in("role", ["jogador", "admin"]);
  }
  // admin: sem filtro adicional — pode contactar qualquer utilizador ativo.

  const { data: contacts, error } = await query.order("name");
  if (error) return fail(error.message, 500);

  return NextResponse.json({ contacts: contacts ?? [] });
}
