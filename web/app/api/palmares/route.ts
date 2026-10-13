import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ADMIN } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/server";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET() {
  // Sessão + conta ativa (revisão final, Crítico 1); as verificações de papel abaixo mantêm-se
  const authz = await authorize();
  if (!authz.ok) return authz.response;
  // Usa admin client para contornar RLS — palmares é informação pública do clube
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("palmares")
    .select("id, epoca, competicao, colocacao, created_at")
    .order("epoca", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ palmares: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Sessão + conta ativa + admin (papel ativo)
  const authz = await authorize(ADMIN);
  if (!authz.ok) return authz.response;
  const { supabase } = authz;

  let body: { epoca?: string; competicao?: string; colocacao?: number };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const { epoca, competicao, colocacao } = body;
  if (!epoca || !competicao || !colocacao) return fail("Campos obrigatórios: epoca, competicao, colocacao");
  if (!["Liga", "Taça"].includes(competicao)) return fail("competicao deve ser Liga ou Taça");
  if (![1, 2, 3].includes(colocacao))         return fail("colocacao deve ser 1, 2 ou 3");

  const { data, error } = await supabase
    .from("palmares")
    .insert({ epoca, competicao, colocacao })
    .select()
    .single();

  if (error) return fail(error.message, 500);
  return NextResponse.json({ entry: data }, { status: 201 });
}
