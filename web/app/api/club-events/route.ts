import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ─── GET /api/club-events?season_id=... ──────────────────
export async function GET(req: NextRequest) {
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const seasonId = req.nextUrl.searchParams.get("season_id");
  if (!seasonId) return fail("season_id obrigatório");

  const { data, error } = await supabase
    .from("club_events")
    .select("*")
    .eq("season_id", seasonId)
    .order("date", { ascending: true });

  if (error) return fail(error.message, 500);
  return ok({ events: data ?? [] });
}

// ─── POST /api/club-events ────────────────────────────────
export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const { season_id, title, description, date, start_time, location } = body;
  if (!season_id || !title || !date) return fail("Campos obrigatórios em falta");

  const { data, error } = await supabase
    .from("club_events")
    .insert({
      season_id, title, date,
      description: description || null,
      start_time: start_time || null,
      location: location || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return fail(error.message, 500);
  return ok({ event: data }, 201);
}
