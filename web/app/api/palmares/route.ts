import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false };
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("email", user.email!)
    .single();
  return { supabase, user, isAdmin: profile?.role === "admin" };
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("palmares")
    .select("id, epoca, competicao, colocacao, created_at")
    .order("epoca", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ palmares: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user, isAdmin } = await requireAdmin();
  if (!user)    return fail("Não autenticado", 401);
  if (!isAdmin) return fail("Sem permissão", 403);

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
