import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const season_id = req.nextUrl.searchParams.get("season_id");
  if (!season_id) return NextResponse.json({ error: "season_id obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("player_payment_summary")
    .select("*")
    .eq("season_id", season_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ summary: data ?? [] });
}
