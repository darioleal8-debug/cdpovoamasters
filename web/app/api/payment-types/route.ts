import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { FINANCE } from "@/lib/auth/roles";
import { clubIdForUser } from "@/lib/auth/club";
import { createAdminClient } from "@/lib/supabase/server";
import { PaymentTypeCreateSchema } from "@/lib/payments/types";

export const runtime = "nodejs";

// GET /api/payment-types — tipos ativos do clube do utilizador (inclui o nº de registos para a gestão).
export async function GET() {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ types: [] });

  const db = await createAdminClient();
  const { data, error } = await db
    .from("payment_types")
    .select("id, name, default_amount, sort_order")
    .eq("club_id", clubId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    types: (data ?? []).map((t) => ({ ...t, default_amount: Number(t.default_amount) })),
  });
}

// POST /api/payment-types — o clube acrescenta um tipo (só administradores e tesoureiro).
export async function POST(req: NextRequest) {
  const auth = await authorize(FINANCE);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = PaymentTypeCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }

  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ error: "Conta sem clube ativo." }, { status: 403 });

  const db = await createAdminClient();
  const { data: last } = await db
    .from("payment_types").select("sort_order").eq("club_id", clubId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await db
    .from("payment_types")
    .insert({
      club_id: clubId,
      name: parsed.data.name,
      default_amount: parsed.data.default_amount,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1,
    })
    .select("id, name, default_amount, sort_order")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um tipo de pagamento com esse nome." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ type: { ...data, default_amount: Number(data.default_amount) } }, { status: 201 });
}
