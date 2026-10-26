import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/guards";
import { ADMIN } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/server";

type ExtractionRaw = {
  arbitros?: string[];
  parciais?: { periodo: number; casa: number; fora: number }[];
  jogadores?: { nome: string; equipa: "casa" | "fora"; numero?: number; pontos?: number; triplos?: number; lances_livres?: number; faltas?: number }[];
  prolongamento?: boolean;
};

// GET /api/liga/admin/backfill-game-stats?eventId=xxx
// Idempotente: preenche league_game_periods e league_game_player_stats
// a partir da submissão aprovada, para jogos aprovados antes da Fase 2.
export async function GET(req: Request) {
  const auth = await authorize(ADMIN);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId obrigatório" }, { status: 400 });
  }

  const admin = await createAdminClient();

  // Verificar que existe resultado aprovado
  const { data: result } = await admin
    .from("league_game_results")
    .select("id, source_submission_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (!result) {
    return NextResponse.json({ error: "Resultado aprovado não encontrado para este evento" }, { status: 404 });
  }

  // Encontrar a submissão aprovada (pela FK ou pela mais recente aprovada)
  const submissionId = result.source_submission_id;
  const { data: subs } = await admin
    .from("result_submissions")
    .select("id, extraction_raw, home_team_id, away_team_id")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(1);
  const sub = submissionId
    ? subs?.find((s) => s.id === submissionId) ?? subs?.[0]
    : subs?.[0];

  if (!sub?.extraction_raw) {
    return NextResponse.json({ error: "Submissão aprovada sem extraction_raw", skipped: true });
  }

  const raw = sub.extraction_raw as ExtractionRaw;

  // Backfill parciais (upsert idempotente)
  const periods = (raw.parciais ?? []).map((p) => ({
    event_id: eventId,
    periodo: p.periodo,
    home_points: p.casa,
    away_points: p.fora,
  }));

  if (periods.length > 0) {
    const { error } = await admin
      .from("league_game_periods")
      .upsert(periods, { onConflict: "event_id,periodo" });
    if (error) return NextResponse.json({ error: `Parciais: ${error.message}` }, { status: 500 });
  }

  // Backfill jogadores (delete + insert)
  const players = (raw.jogadores ?? []).map((j) => ({
    event_id: eventId,
    team_id: j.equipa === "casa" ? (sub.home_team_id ?? null) : (sub.away_team_id ?? null),
    side: j.equipa === "casa" ? "home" : "away",
    numero: j.numero ?? null,
    nome: j.nome,
    pontos: j.pontos ?? 0,
    triplos: j.triplos ?? 0,
    lances_livres: j.lances_livres ?? 0,
    faltas: j.faltas ?? 0,
  }));

  if (players.length > 0) {
    await admin.from("league_game_player_stats").delete().eq("event_id", eventId);
    const { error } = await admin.from("league_game_player_stats").insert(players);
    if (error) return NextResponse.json({ error: `Jogadores: ${error.message}` }, { status: 500 });
  }

  // Atualizar referees/overtime/source_submission_id no resultado
  await admin
    .from("league_game_results")
    .update({
      referees: raw.arbitros?.length ? raw.arbitros : null,
      overtime: raw.prolongamento === true,
      source_submission_id: sub.id,
    })
    .eq("event_id", eventId);

  revalidatePath(`/liga-inatel/jogo/${eventId}`);

  return NextResponse.json({
    ok: true,
    eventId,
    periods: periods.length,
    players: players.length,
    referees: raw.arbitros ?? [],
    overtime: raw.prolongamento === true,
  });
}
