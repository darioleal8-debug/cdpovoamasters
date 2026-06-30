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

// ─── GET /api/trainings/[id]/attendance ──────────────────
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const { data, error } = await supabase
    .from("training_attendance")
    .select("*")
    .eq("training_id", id);

  if (error) return fail(error.message, 500);
  return ok({ attendance: data ?? [] });
}

// ─── POST /api/trainings/[id]/attendance ─────────────────
// Body: { records: [{ player_id, status }] }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: training_id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  let body: { records: { player_id: string; status: string }[] };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return fail("records[] obrigatório");
  }

  const rows = body.records.map((r) => ({
    training_id,
    player_id:  r.player_id,
    status:     r.status,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }));

  const { error } = await supabase
    .from("training_attendance")
    .upsert(rows, { onConflict: "training_id,player_id" });

  if (error) return fail(error.message, 500);
  return ok({ saved: rows.length });
}
