import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("email", user.email!)
    .single();
  if (profile?.role !== "admin") return fail("Sem permissão", 403);

  const { error } = await supabase.from("palmares").delete().eq("id", id);
  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true });
}
