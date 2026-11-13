import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { normalizePlayDraft } from "@/lib/plays/normalize";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/plays/:id { play?, status?, ai_prompt?, ai_history? }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await authorize(["admin", "treinador"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as
    | { play?: unknown; status?: string; ai_prompt?: string; ai_history?: unknown[] }
    | null;
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const upd: Record<string, unknown> = {};
  if (body.play !== undefined) {
    const n = normalizePlayDraft(body.play);
    if (!n.ok) return NextResponse.json({ error: n.error }, { status: 422 });
    Object.assign(upd, n.play);
  }
  if (body.status === "draft" || body.status === "published") {
    upd.status = body.status;
    if (body.status === "published") upd.published_at = new Date().toISOString();
    else upd.published_at = null;
  }
  if (typeof body.ai_prompt === "string") upd.ai_prompt = body.ai_prompt.slice(0, 3000);
  if (Array.isArray(body.ai_history)) upd.ai_history = body.ai_history.slice(-20);
  if (Object.keys(upd).length === 0) return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });

  const { data, error } = await auth.supabase.from("plays").update(upd).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Jogada não encontrada" }, { status: 404 });
  return NextResponse.json({ id: data.id });
}

// DELETE /api/plays/:id
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await authorize(["admin", "treinador"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { error } = await auth.supabase.from("plays").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
