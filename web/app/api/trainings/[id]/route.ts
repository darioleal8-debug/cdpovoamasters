import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...data });
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

// ─── GET /api/trainings/[id] ─────────────────────────────
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const { data, error } = await supabase
    .from("trainings")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return fail(error.message, 404);
  return ok({ training: data });
}

// ─── PUT /api/trainings/[id] ─────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const { date, start_time, end_time, location, type, notes } = body as Record<string, string>;

  const { data, error } = await supabase
    .from("trainings")
    .update({
      date, start_time, end_time: end_time || null,
      location: location || "", type, notes: notes || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return fail(error.message, 500);
  return ok({ training: data });
}

// ─── DELETE /api/trainings/[id] ──────────────────────────
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const { error } = await supabase.from("trainings").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return ok({ deleted: id });
}
