import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const season_id = sp.get("season_id");
  const player_id = sp.get("player_id");
  const month     = sp.get("month");
  const year      = sp.get("year");
  const status    = sp.get("status");

  let query = supabase
    .from("player_payments")
    .select("*, player:players(id, name, number)")
    .order("reference_year", { ascending: true })
    .order("month",          { ascending: true });

  if (season_id) query = query.eq("season_id", season_id);
  if (player_id) query = query.eq("player_id", player_id);
  if (month)     query = query.eq("month",          parseInt(month));
  if (year)      query = query.eq("reference_year", parseInt(year));
  if (status && status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payments: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { season_id, player_id, month, reference_year, amount, amount_due, status, method, notes, payment_date } = body;

  if (!season_id || !player_id || !month || !reference_year) {
    return NextResponse.json(
      { error: "season_id, player_id, month e reference_year são obrigatórios" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("player_payments")
    .upsert(
      {
        season_id,
        player_id,
        month,
        reference_year,
        amount:       amount       ?? 0,
        amount_due:   amount_due   ?? 20,
        status:       status       ?? "paid",
        method:       method       || null,
        notes:        notes        || null,
        payment_date: payment_date || null,
        created_by:   user.id,
      },
      { onConflict: "season_id,player_id,month,reference_year" }
    )
    .select("*, player:players(id, name, number)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payment: data }, { status: 201 });
}
