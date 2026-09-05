import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
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

export async function GET() {
  const db = adminClient();
  const { data, error } = await db
    .from("hist_seasons")
    .select("id, label, start_year, end_year, notes, created_at")
    .order("start_year", { ascending: false });
  if (error) return fail(error.message, 500);
  return NextResponse.json({ seasons: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const db = adminClient();
  const { data: profile } = await db.from("users").select("role").eq("id", authUser.id).single();
  if (!profile || !["admin", "treinador"].includes(profile.role)) return fail("Sem permissão", 403);

  const body = await req.json().catch(() => ({}));
  const { label, start_year, end_year, notes } = body as {
    label?: string; start_year?: number; end_year?: number; notes?: string;
  };

  if (!label?.trim()) return fail("label é obrigatório");

  // Auto-parse "2018/2019" format if years not provided
  let sy = start_year, ey = end_year;
  if (!sy || !ey) {
    const m = label.match(/(\d{4})[\/\-](\d{4})/);
    if (m) { sy = parseInt(m[1]); ey = parseInt(m[2]); }
    else {
      const y = parseInt(label);
      if (!isNaN(y)) { sy = y; ey = y + 1; }
    }
  }
  if (!sy || !ey) return fail("Não foi possível determinar start_year / end_year. Exemplo: '2018/2019'");

  const { data, error } = await db
    .from("hist_seasons")
    .insert({ label: label.trim(), start_year: sy, end_year: ey, notes: notes?.trim() ?? null })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return fail(`Temporada '${label}' já existe`);
    return fail(error.message, 500);
  }
  return NextResponse.json({ season: data }, { status: 201 });
}
