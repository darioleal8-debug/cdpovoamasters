import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { parseGameMeta } from "@/types/competitions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const { home_score, away_score, motivo } = (await req.json()) as {
    home_score: number;
    away_score: number;
    motivo: string;
  };

  if (typeof home_score !== "number" || typeof away_score !== "number") {
    return NextResponse.json({ error: "home_score e away_score obrigatórios" }, { status: 400 });
  }
  if (!motivo?.trim()) {
    return NextResponse.json({ error: "motivo obrigatório" }, { status: 400 });
  }

  const adminClient = await createAdminClient();

  // Ler evento + resultado atual
  const [eventRes, currentResultRes, compRes] = await Promise.all([
    adminClient.from("events").select("id, description, opponent, competition, season_id").eq("id", eventId).single(),
    adminClient.from("league_game_results").select("*").eq("event_id", eventId).maybeSingle(),
    adminClient.from("competitions").select("id").eq("slug", "liga-inatel").single(),
  ]);

  if (!eventRes.data) {
    return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  }

  const meta = parseGameMeta(eventRes.data.description ?? null);
  const ourTeamRes = await adminClient.from("league_teams").select("name").eq("is_our_team", true).single();
  const ourTeam = ourTeamRes.data?.name ?? "";

  const homeTeamName = meta?.home_team ?? ourTeam;
  const awayTeamName = meta?.away_team ?? (eventRes.data.opponent ?? "Adversário");
  const competitionId = compRes.data?.id ?? null;

  const valorAntigo = currentResultRes.data
    ? { home_score: currentResultRes.data.home_score, away_score: currentResultRes.data.away_score }
    : null;

  // UPSERT resultado
  const { data: newResult, error: upsertError } = await adminClient
    .from("league_game_results")
    .upsert({
      event_id: eventId,
      competition_id: competitionId,
      home_team_name: homeTeamName,
      away_team_name: awayTeamName,
      home_score,
      away_score,
      approved_at: new Date().toISOString(),
    }, { onConflict: "event_id" })
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Registar auditoria
  await adminClient.from("liga_resultado_audit").insert({
    jogo_id: eventId,
    alterado_por: auth.user.id,
    valor_antigo: valorAntigo,
    valor_novo: { home_score, away_score },
    motivo: motivo.trim(),
  });

  // Resolver marcadores: se este jogo tem jogo_num, actualiza eventos futuros que
  // referenciam 'Vencedor Jogo N' como home_team ou away_team.
  if (meta?.jogo_num && eventRes.data.season_id) {
    const placeholder = `Vencedor Jogo ${meta.jogo_num}`;
    const winner = home_score > away_score ? homeTeamName : awayTeamName;

    const { data: futureEvents } = await adminClient
      .from("events")
      .select("id, description, opponent")
      .eq("season_id", eventRes.data.season_id)
      .eq("game_type", "official")
      .neq("id", eventId);

    if (futureEvents) {
      for (const fe of futureEvents) {
        if (!fe.description) continue;
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(fe.description as string); } catch { continue; }

        let changed = false;
        if (parsed.home_team === placeholder) { parsed.home_team = winner; changed = true; }
        if (parsed.away_team === placeholder) { parsed.away_team = winner; changed = true; }

        if (changed) {
          const updates: { description: string; opponent?: string } = {
            description: JSON.stringify(parsed),
          };
          if ((fe.opponent as string | null) === placeholder) updates.opponent = winner;
          await adminClient.from("events").update(updates).eq("id", fe.id);
        }
      }
    }
  }

  revalidatePath("/liga-inatel", "layout");
  return NextResponse.json({ result: newResult });
}
