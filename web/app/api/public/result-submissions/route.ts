import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";

const MAX_PER_IP_PER_HOUR = 5;

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip + (process.env.IP_HASH_SALT ?? "")).digest("hex").slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      event_id, competition_id,
      home_team_name, away_team_name,
      home_score, away_score,
      submitted_by_name, submitted_by_team, submitted_by_contact,
      notes,
    } = body as Record<string, unknown>;

    // Basic validation
    if (
      typeof event_id !== "string" || !event_id ||
      typeof home_team_name !== "string" || !home_team_name.trim() ||
      typeof away_team_name !== "string" || !away_team_name.trim() ||
      typeof home_score !== "number" || home_score < 0 ||
      typeof away_score !== "number" || away_score < 0 ||
      typeof submitted_by_name !== "string" || !submitted_by_name.trim()
    ) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    if (home_score === away_score) {
      return NextResponse.json({ error: "Empates não existem em basquetebol" }, { status: 400 });
    }

    if (home_score > 300 || away_score > 300) {
      return NextResponse.json({ error: "Resultado fora de limites razoáveis" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = hashIp(ip);

    const supabase = await createAdminClient();

    // Verify the event exists and is a valid league game
    const { data: event } = await supabase
      .from("events")
      .select("id, type, competition, event_date")
      .eq("id", event_id)
      .eq("type", "jogo")
      .single();

    if (!event) {
      return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
    }

    // Don't allow submissions for future games
    const gameDate = new Date(event.event_date);
    const now = new Date();
    if (gameDate > now) {
      return NextResponse.json({ error: "Ainda não podes submeter um resultado para um jogo futuro" }, { status: 400 });
    }

    // Check if an approved result already exists
    const { data: existing } = await supabase
      .from("league_game_results")
      .select("id")
      .eq("event_id", event_id)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Este jogo já tem um resultado oficial" }, { status: 409 });
    }

    // Basic rate limit: max 5 submissions per IP per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("result_submissions")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("submitted_at", oneHourAgo);

    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return NextResponse.json({ error: "Demasiadas submissões. Tenta mais tarde." }, { status: 429 });
    }

    const { data: submission, error } = await supabase
      .from("result_submissions")
      .insert({
        event_id,
        competition_id: competition_id ?? null,
        home_team_name: String(home_team_name).trim(),
        away_team_name: String(away_team_name).trim(),
        home_score: Number(home_score),
        away_score: Number(away_score),
        submitted_by_name: String(submitted_by_name).trim(),
        submitted_by_team: submitted_by_team ? String(submitted_by_team).trim() : null,
        submitted_by_contact: submitted_by_contact ? String(submitted_by_contact).trim() : null,
        notes: notes ? String(notes).trim() : null,
        status: "pending",
        ip_hash: ipHash,
      })
      .select("id")
      .single();

    if (error) {
      console.error("result-submissions insert error:", error);
      return NextResponse.json({ error: "Erro ao guardar submissão" }, { status: 500 });
    }

    return NextResponse.json({ id: submission.id }, { status: 201 });
  } catch (err) {
    console.error("result-submissions POST error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
