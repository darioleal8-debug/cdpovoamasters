import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { FINANCE } from "@/lib/auth/roles";
import { clubIdForUser } from "@/lib/auth/club";
import { createAdminClient } from "@/lib/supabase/server";
import { PaymentTypePatchSchema } from "@/lib/payments/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/payment-types/:id — renomear / alterar o valor por defeito.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await authorize(FINANCE);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = PaymentTypePatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ error: "Conta sem clube ativo." }, { status: 403 });

  const db = await createAdminClient();
  const { data, error } = await db
    .from("payment_types")
    .update(parsed.data)
    .eq("id", id).eq("club_id", clubId).eq("active", true)
    .select("id, name, default_amount, sort_order")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um tipo de pagamento com esse nome." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Tipo não encontrado." }, { status: 404 });
  return NextResponse.json({ type: { ...data, default_amount: Number(data.default_amount) } });
}

// DELETE /api/payment-types/:id — sem registos apaga; com registos arquiva (o histórico mantém-se).
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await authorize(FINANCE);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ error: "Conta sem clube ativo." }, { status: 403 });

  const db = await createAdminClient();
  const { data: type } = await db
    .from("payment_types").select("id").eq("id", id).eq("club_id", clubId).eq("active", true).maybeSingle();
  if (!type) return NextResponse.json({ error: "Tipo não encontrado." }, { status: 404 });

  const { count, error: countErr } = await db
    .from("player_charges").select("id", { count: "exact", head: true })
    .eq("club_id", clubId).eq("payment_type_id", id);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  if ((count ?? 0) > 0) {
    const { error } = await db.from("payment_types").update({ active: false }).eq("id", id).eq("club_id", clubId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, archived: true, charges: count });
  }
  const { error } = await db.from("payment_types").delete().eq("id", id).eq("club_id", clubId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, archived: false });
}
