import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { getCupBracket } from "@/lib/cup";

export const dynamic = "force-dynamic";

/** Quadro da Taça da Liga INATEL para a app de gestão (qualquer utilizador autenticado). */
export async function GET() {
  const a = await authorize();
  if (!a.ok) return a.response;
  const bracket = await getCupBracket();
  return NextResponse.json(bracket);
}
