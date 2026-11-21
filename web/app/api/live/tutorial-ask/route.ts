import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { MANAGERS } from "@/lib/auth/roles";
import { deepseekJSONDetailed } from "@/lib/deepseek";
import { TUTORIAL_QUESTION_MAX, tutorialSystemPrompt } from "@/lib/live/tutorial";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Turn { q: string; a: string }

/** Dúvida sobre o live: a IA (DeepSeek) responde só com base no tutorial. */
export async function POST(req: NextRequest) {
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;

  if (!process.env.DEEPSEEK_API_KEY)
    return NextResponse.json({ error: "A ajuda com IA não está configurada." }, { status: 500 });

  let body: { question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Escreve a tua dúvida." }, { status: 400 });
  if (question.length > TUTORIAL_QUESTION_MAX)
    return NextResponse.json({ error: `A dúvida pode ter no máximo ${TUTORIAL_QUESTION_MAX} caracteres.` }, { status: 400 });

  // Últimas trocas (só para perguntas de seguimento), limitadas em número e tamanho.
  const history: Turn[] = Array.isArray(body.history)
    ? (body.history as unknown[])
        .filter((t): t is Turn => !!t && typeof (t as Turn).q === "string" && typeof (t as Turn).a === "string")
        .slice(-3)
        .map((t) => ({ q: t.q.slice(0, TUTORIAL_QUESTION_MAX), a: t.a.slice(0, 1200) }))
    : [];

  const context = history.length
    ? `Conversa anterior:\n${history.map((t) => `Pergunta: ${t.q}\nResposta: ${t.a}`).join("\n\n")}\n\n`
    : "";

  const ai = await deepseekJSONDetailed<{ answer?: string }>({
    system: tutorialSystemPrompt(),
    user: `${context}Pergunta: ${question}`,
    maxTokens: 600,
    temperature: 0.2,
    transientRetries: 1,
    feature: "live-tutorial-ask",
  });

  if (!ai.ok) {
    console.error("[live/tutorial-ask]", ai.kind, ai.error);
    if (ai.kind === "budget")
      return NextResponse.json({ error: "O limite mensal de IA do clube foi atingido." }, { status: 429 });
    return NextResponse.json({ error: "Não foi possível responder agora. Tenta de novo daqui a pouco." }, { status: 502 });
  }

  const answer = typeof ai.data.answer === "string" ? ai.data.answer.trim() : "";
  if (!answer) return NextResponse.json({ error: "Não foi possível responder agora. Tenta de novo." }, { status: 502 });
  return NextResponse.json({ answer });
}
