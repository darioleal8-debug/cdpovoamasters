import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const hexRe = /^#[0-9A-Fa-f]{6}$/;
  const colorFields = ["jersey_home_color", "shorts_home_color", "jersey_away_color", "shorts_away_color"] as const;
  for (const f of colorFields) {
    if (body[f] !== undefined && !hexRe.test(body[f])) {
      return NextResponse.json({ error: `Cor inválida em ${f}: ${body[f]}` }, { status: 400 });
    }
  }

  const { team_name: _tn, team_name_lower: _tnl, ...allowed } = body;

  const { data, error } = await supabase
    .from("team_kits")
    .update({ ...allowed, updated_by: user.id })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kit: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("team_kits")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
