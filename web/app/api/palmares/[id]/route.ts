import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ADMIN } from "@/lib/auth/roles";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Sessão + conta ativa + admin (papel ativo); antes procurava o perfil por email
  const auth = await authorize(ADMIN);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { error } = await supabase.from("palmares").delete().eq("id", id);
  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true });
}
