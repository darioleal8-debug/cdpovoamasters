import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// PATCH /api/liga/equipa/kit
// Delegado actualiza as cores do equipamento da SUA equipa.
// team_id é derivado da sessão — nunca do cliente.
// Usa RPC SECURITY DEFINER para restringir colunas a nível da BD.
export async function PATCH(req: Request) {
  const supabase = await createClient();

  // 1. Validar sessão
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // 2. Confirmar que o utilizador é delegado de uma equipa
  const { data: membership } = await supabase
    .from("league_team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Sem acesso de equipa" }, { status: 403 });
  }

  // 3. Ler body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const { primary_color, secondary_color } = body as Record<string, unknown>;

  if (typeof primary_color !== "string" || typeof secondary_color !== "string") {
    return NextResponse.json({ error: "As duas cores são obrigatórias" }, { status: 400 });
  }

  if (!HEX_RE.test(primary_color) || !HEX_RE.test(secondary_color)) {
    return NextResponse.json(
      { error: "Formato de cor inválido — use #RRGGBB (ex: #E63946)" },
      { status: 400 }
    );
  }

  // 4. Chamar RPC SECURITY DEFINER
  // team_id é derivado de auth.uid() dentro da função — nunca confiamos no cliente
  const { error } = await supabase.rpc("delegate_update_team_colors", {
    p_primary_color: primary_color,
    p_secondary_color: secondary_color,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 5. Invalidar cache ISR nas páginas públicas
  revalidatePath("/liga-inatel/equipas", "layout");
  revalidatePath("/liga-inatel", "layout");

  return NextResponse.json({ ok: true });
}
