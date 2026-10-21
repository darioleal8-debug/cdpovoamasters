import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: membership } = await supabase
    .from("league_team_members")
    .select("team_id, league_teams(name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Sem acesso de equipa" }, { status: 403 });

  const teamName = (membership.league_teams as unknown as { name: string } | null)?.name ?? "Delegado";

  const body = (await req.json()) as {
    event_id: string;
    home_team_name: string;
    away_team_name: string;
    home_score: number;
    away_score: number;
    photo_path?: string;
    notes?: string;
    extraction_raw?: Record<string, unknown>;
  };

  if (!body.event_id || body.home_score == null || body.away_score == null)
    return NextResponse.json({ error: "Campos obrigatórios em falta" }, { status: 400 });
  if (!Number.isInteger(body.home_score) || !Number.isInteger(body.away_score) ||
      body.home_score < 0 || body.away_score < 0)
    return NextResponse.json({ error: "Pontuações inválidas" }, { status: 400 });

  const { data: event } = await supabase
    .from("events")
    .select("id, title, event_date, competition")
    .eq("id", body.event_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });

  const { error: insertErr } = await supabase.from("result_submissions").insert({
    event_id: body.event_id,
    home_team_name: body.home_team_name,
    away_team_name: body.away_team_name,
    home_score: body.home_score,
    away_score: body.away_score,
    submitted_by_name: teamName,
    submitted_by_team: teamName,
    photo_url: body.photo_path ?? null,
    notes: body.notes ?? null,
  });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
