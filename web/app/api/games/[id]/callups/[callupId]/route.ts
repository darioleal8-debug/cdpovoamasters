import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { canManageContent } from "@/lib/permissions";

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

// ─── DELETE /api/games/[id]/callups/[callupId] ───────────
// Apenas admin/treinador podem remover convocados.
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; callupId: string }> }
) {
  const { id: game_id, callupId } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const { data: caller } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!caller || !canManageContent(caller.role)) {
    return fail("Apenas administradores e treinadores podem remover convocados", 403);
  }

  const { error } = await supabase
    .from("game_callups")
    .delete()
    .eq("id", callupId)
    .eq("game_id", game_id);

  if (error) return fail(error.message, 500);
  return ok({ deleted: callupId });
}
