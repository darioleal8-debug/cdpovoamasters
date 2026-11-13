import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

// PATCH /api/master/clubs/:id/members/:userId { active } — ativar/desativar acesso ao clube
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { id, userId } = await params;
  let body: { active?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "active obrigatório" }, { status: 400 });
  if (userId === m.user.id) return NextResponse.json({ error: "Não podes alterar o teu próprio acesso" }, { status: 400 });

  const { error } = await m.admin.from("club_members").update({ active: body.active }).eq("club_id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
