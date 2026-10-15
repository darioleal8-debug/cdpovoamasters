import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get("season_id");
  if (!seasonId) return NextResponse.json({ error: "season_id obrigatório" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("payments")
    .select("id, month, reference_year, amount, status, paid_at")
    .eq("season_id", seasonId)
    .eq("user_id", user.id)
    .order("reference_year", { ascending: true })
    .order("month", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const payments = data ?? [];
  const paid    = payments.filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.amount), 0);
  const pending = payments.filter((p) => p.status === "pendente").reduce((s, p) => s + Number(p.amount), 0);

  return NextResponse.json({
    payments,
    summary: { total: paid + pending, paid, pending },
  });
}
