import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSubmission } from "@/lib/competitions-data";
import { parseGameMeta } from "@/types/competitions";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const admin = await createAdminClient();
    const submission = await getSubmission(id);

    if (!submission) {
      return NextResponse.json({ error: "Submissão não encontrada" }, { status: 404 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json({ error: "Submissão já foi processada" }, { status: 409 });
    }

    // Fetch event details for jornada/volta
    const { data: event } = await admin
      .from("events")
      .select("id, description, opponent, season_id")
      .eq("id", submission.event_id)
      .single();

    const meta = parseGameMeta(event?.description ?? null);

    // Insert official result
    const { error: insertError } = await admin
      .from("league_game_results")
      .insert({
        event_id:       submission.event_id,
        competition_id: submission.competition_id,
        home_team_name: submission.home_team_name,
        away_team_name: submission.away_team_name,
        home_score:     submission.home_score,
        away_score:     submission.away_score,
        jornada:        meta?.jornada  ?? null,
        volta:          meta?.volta    ?? null,
        approved_by:    user.id,
        approved_at:    new Date().toISOString(),
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "Este jogo já tem um resultado oficial" }, { status: 409 });
      }
      throw insertError;
    }

    // Mark submission as approved
    await admin
      .from("result_submissions")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", id);

    // Reject all other pending submissions for the same event
    await admin
      .from("result_submissions")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: user.id, rejection_reason: "Outro resultado aprovado para este jogo" })
      .eq("event_id", submission.event_id)
      .eq("status", "pending")
      .neq("id", id);

    // If this is CD Póvoa's game, also update game_sessions
    const { data: ourTeam } = await admin
      .from("league_teams")
      .select("name")
      .eq("is_our_team", true)
      .single();

    const isOurGame =
      ourTeam &&
      (submission.home_team_name.toLowerCase().includes("póvoa") ||
       submission.away_team_name.toLowerCase().includes("póvoa") ||
       submission.home_team_name === ourTeam.name ||
       submission.away_team_name === ourTeam.name);

    if (isOurGame) {
      const { data: session } = await admin
        .from("game_sessions")
        .select("id")
        .eq("event_id", submission.event_id)
        .single();

      if (session) {
        await admin
          .from("game_sessions")
          .update({
            home_score:  submission.home_score,
            away_score:  submission.away_score,
            status:      "finished",
            finished_at: new Date().toISOString(),
          })
          .eq("id", session.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("approve submission error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
