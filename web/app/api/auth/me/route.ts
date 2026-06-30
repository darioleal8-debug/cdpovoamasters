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

// ─── GET /api/auth/me ─────────────────────────────────────
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const admin = adminClient();

  const { data: profile } = await admin
    .from("users")
    .select("id, email, name, role, phone, birth_date, photo_url, active")
    .eq("id", authUser.id)
    .single();

  // Buscar registo de jogador ligado (se existir)
  const { data: playerRows } = await admin
    .from("players")
    .select("id, name, position, height, weight, age, photo_url, number, season_id")
    .eq("user_id", authUser.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const player = playerRows?.[0] ?? null;

  return NextResponse.json({
    user: profile ?? {
      id:    authUser.id,
      email: authUser.email,
      name:  authUser.user_metadata?.name ?? authUser.email,
      role:  "admin", // fallback para utilizadores sem registo (admin original)
    },
    player,
  });
}

// ─── PUT /api/auth/me ─── jogador edita o próprio perfil ─
export async function PUT(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const admin = adminClient();

  // Campos permitidos para edição própria
  const userUpdates: Record<string, unknown> = {};
  if (body.name       !== undefined) userUpdates.name       = String(body.name).trim()       || null;
  if (body.phone      !== undefined) userUpdates.phone      = String(body.phone).trim()      || null;
  if (body.birth_date !== undefined) userUpdates.birth_date = String(body.birth_date).trim() || null;

  if (Object.keys(userUpdates).length > 0) {
    const { error } = await admin
      .from("users")
      .update(userUpdates)
      .eq("id", authUser.id);
    if (error) return fail(`Erro ao atualizar perfil: ${error.message}`, 500);
  }

  // Atualizar dados do jogador (se ligado)
  const playerUpdates: Record<string, unknown> = {};
  if (body.position !== undefined) playerUpdates.position = body.position || null;
  if (body.height   !== undefined) playerUpdates.height   = Number(body.height) || null;
  if (body.weight   !== undefined) playerUpdates.weight   = Number(body.weight) || null;
  if (body.age      !== undefined) playerUpdates.age      = Number(body.age)    || null;

  if (Object.keys(playerUpdates).length > 0) {
    await admin
      .from("players")
      .update(playerUpdates)
      .eq("user_id", authUser.id);
  }

  return NextResponse.json({ success: true });
}
