import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("team_kits")
    .select("id, team_name, jersey_home_color, shorts_home_color, jersey_away_color, shorts_away_color, notes, updated_by, updated_at")
    .order("team_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kits: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { team_name, jersey_home_color, shorts_home_color, jersey_away_color, shorts_away_color, notes } = body;

  if (!team_name?.trim()) {
    return NextResponse.json({ error: "team_name é obrigatório" }, { status: 400 });
  }

  // Validar cores HEX
  const hexRe = /^#[0-9A-Fa-f]{6}$/;
  for (const [field, val] of Object.entries({ jersey_home_color, shorts_home_color, jersey_away_color, shorts_away_color })) {
    if (val && !hexRe.test(val)) {
      return NextResponse.json({ error: `Cor inválida em ${field}: ${val}` }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("team_kits")
    .upsert(
      {
        team_name:         team_name.trim(),
        jersey_home_color: jersey_home_color ?? "#1e3a8a",
        shorts_home_color: shorts_home_color ?? "#1e3a8a",
        jersey_away_color: jersey_away_color ?? "#ffffff",
        shorts_away_color: shorts_away_color ?? "#ffffff",
        notes:             notes?.trim() || null,
        updated_by:        user.id,
      },
      { onConflict: "team_name_lower" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kit: data }, { status: 201 });
}
