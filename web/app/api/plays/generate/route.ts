import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { generatePlay } from "@/lib/plays/generate";
import { normalizePlayDraft } from "@/lib/plays/normalize";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/plays/generate { prompt, current? } — gera (ou altera) uma jogada animada com a IA
export async function POST(req: NextRequest) {
  const auth = await authorize(["admin", "treinador"]);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { prompt?: unknown; current?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 10) return NextResponse.json({ error: "Descreve a jogada com mais detalhe (mín. 10 caracteres)." }, { status: 400 });
  if (prompt.length > 3000) return NextResponse.json({ error: "Descrição demasiado longa (máx. 3000 caracteres)." }, { status: 400 });

  let current = null;
  if (body?.current) {
    const n = normalizePlayDraft(body.current);
    if (n.ok) current = n.play;
  }

  const r = await generatePlay({ prompt, current });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ play: r.play, warnings: r.warnings });
}
