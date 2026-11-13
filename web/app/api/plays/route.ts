import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { normalizePlayDraft } from "@/lib/plays/normalize";

// POST /api/plays { play, status, ai_prompt?, ai_history? } — cria uma jogada (RLS: só admin/treinador)
export async function POST(req: NextRequest) {
  const auth = await authorize(["admin", "treinador"]);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as
    | { play?: unknown; status?: string; ai_prompt?: string; ai_history?: unknown[] }
    | null;
  const n = normalizePlayDraft(body?.play);
  if (!n.ok) return NextResponse.json({ error: n.error }, { status: 422 });
  const status = body?.status === "published" ? "published" : "draft";

  const { data, error } = await auth.supabase
    .from("plays")
    .insert({
      ...n.play,
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      ai_prompt: typeof body?.ai_prompt === "string" ? body.ai_prompt.slice(0, 3000) : null,
      ai_history: Array.isArray(body?.ai_history) ? body.ai_history.slice(-20) : [],
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
