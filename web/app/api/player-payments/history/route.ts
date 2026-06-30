import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payment_id = req.nextUrl.searchParams.get("payment_id");
  if (!payment_id) return NextResponse.json({ error: "payment_id obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("player_payments_history")
    .select("*, editor:changed_by(email)")
    .eq("payment_id", payment_id)
    .order("changed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data ?? [] });
}
