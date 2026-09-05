import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

interface StatAgg {
  games: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fouls: number;
  efficiency: number;
}

function avg(sum: number, games: number): number {
  return games > 0 ? Math.round((sum / games) * 10) / 10 : 0;
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key)
    return NextResponse.json({ error: "DEEPSEEK_API_KEY não configurada" }, { status: 500 });

  let event_id: string;
  try {
    ({ event_id } = await req.json());
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!event_id)
    return NextResponse.json({ error: "event_id obrigatório" }, { status: 400 });

  const admin = await createAdminClient();

  // Get event
  const { data: event } = await admin
    .from("events")
    .select("id, season_id, opponent, title, event_date, type")
    .eq("id", event_id)
    .single();
  if (!event)
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  const seasonId = event.season_id as string;
  const opponent = event.opponent as string | null;
  const opponentDisplay = opponent ?? "adversário";

  if (!seasonId)
    return NextResponse.json({ error: "Evento sem época associada" }, { status: 400 });

  // Parallel queries
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: players },
    { data: paymentSummary },
    { data: seasonStats },
  ] = await Promise.all([
    admin
      .from("players")
      .select("id, user_id, number, position")
      .eq("season_id", seasonId),
    admin
      .from("player_payment_summary")
      .select("player_id, months_late")
      .eq("season_id", seasonId),
    admin
      .from("player_game_stats")
      .select(
        "player_id, pts, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, efficiency"
      )
      .eq("season_id", seasonId),
  ]);

  const playerList = players ?? [];
  const userIds = playerList
    .map((p: { user_id: string | null }) => p.user_id)
    .filter((id): id is string => Boolean(id));

  const { data: users } = await admin
    .from("users")
    .select("id, name")
    .in("id", userIds);

  const userMap = new Map(
    (users ?? []).map((u: { id: string; name: string }) => [u.id, u.name])
  );
  const lateMap = new Map(
    (paymentSummary ?? []).map(
      (p: { player_id: string; months_late: number }) => [
        p.player_id,
        (p.months_late ?? 0) > 0,
      ]
    )
  );

  // Aggregate season stats per player
  const seasonAgg = new Map<string, StatAgg>();
  for (const s of seasonStats ?? []) {
    const cur = seasonAgg.get(s.player_id) ?? {
      games: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fouls: 0, efficiency: 0,
    };
    cur.games++;
    cur.pts += s.pts ?? 0;
    cur.reb += (s.reb_off ?? 0) + (s.reb_def ?? 0);
    cur.ast += s.ast ?? 0;
    cur.stl += s.stl ?? 0;
    cur.blk += s.blk ?? 0;
    cur.tov += s.tov ?? 0;
    cur.fouls += s.fouls_committed ?? 0;
    cur.efficiency += Number(s.efficiency ?? 0);
    seasonAgg.set(s.player_id, cur);
  }

  // Historical stats vs same opponent
  const vsAgg = new Map<string, StatAgg>();
  let pastEventCount = 0;

  if (opponent) {
    const { data: pastEvents } = await admin
      .from("events")
      .select("id")
      .eq("season_id", seasonId)
      .eq("opponent", opponent)
      .eq("type", "jogo")
      .neq("id", event_id)
      .lte("event_date", today);

    pastEventCount = pastEvents?.length ?? 0;

    if (pastEventCount > 0) {
      const pastEventIds = pastEvents!.map((e: { id: string }) => e.id);

      const { data: pastSessions } = await admin
        .from("game_sessions")
        .select("id")
        .in("event_id", pastEventIds);

      if (pastSessions?.length) {
        const { data: vsStats } = await admin
          .from("player_game_stats")
          .select(
            "player_id, pts, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, efficiency"
          )
          .in(
            "game_session_id",
            pastSessions.map((s: { id: string }) => s.id)
          );

        for (const s of vsStats ?? []) {
          const cur = vsAgg.get(s.player_id) ?? {
            games: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fouls: 0, efficiency: 0,
          };
          cur.games++;
          cur.pts += s.pts ?? 0;
          cur.reb += (s.reb_off ?? 0) + (s.reb_def ?? 0);
          cur.ast += s.ast ?? 0;
          cur.stl += s.stl ?? 0;
          cur.blk += s.blk ?? 0;
          cur.tov += s.tov ?? 0;
          cur.fouls += s.fouls_committed ?? 0;
          cur.efficiency += Number(s.efficiency ?? 0);
          vsAgg.set(s.player_id, cur);
        }
      }
    }
  }

  // Build payload for DeepSeek
  const playerPayload = playerList.map(
    (p: { id: string; user_id: string | null; number: number | null; position: string | null }) => {
      const name = userMap.get(p.user_id ?? "") ?? "Desconhecido";
      const isLate = lateMap.get(p.id) ?? false;
      const season = seasonAgg.get(p.id);
      const vs = vsAgg.get(p.id);

      return {
        player_id: p.id,
        name,
        position: p.position ?? null,
        availability: !isLate,
        monthly_fee_status: isLate ? "late" : "paid",
        stats_season: season
          ? {
              games: season.games,
              avg_pts: avg(season.pts, season.games),
              avg_reb: avg(season.reb, season.games),
              avg_ast: avg(season.ast, season.games),
              avg_stl: avg(season.stl, season.games),
              avg_blk: avg(season.blk, season.games),
              avg_tov: avg(season.tov, season.games),
              avg_efficiency: avg(season.efficiency, season.games),
            }
          : null,
        stats_vs_opponent: vs
          ? {
              games: vs.games,
              avg_pts: avg(vs.pts, vs.games),
              avg_reb: avg(vs.reb, vs.games),
              avg_ast: avg(vs.ast, vs.games),
              avg_stl: avg(vs.stl, vs.games),
              avg_efficiency: avg(vs.efficiency, vs.games),
            }
          : null,
      };
    }
  );

  const systemPrompt = `És um analista de basquetebol especializado em recomendar convocatórias com base em dados estatísticos.
Regras obrigatórias:
- Jogadores com availability=false NUNCA podem aparecer em recommended_players.
- Máximo 12 jogadores em recommended_players.
- Baseia as tuas decisões em stats reais — nunca inventes dados.
- Justificações em português europeu, concisas e objetivas (máx. 2 frases).
- Devolve APENAS JSON válido, sem texto adicional, sem markdown.`;

  const userPrompt = `Analisa os dados e recomenda a melhor convocatória para o jogo contra "${opponentDisplay}".

Considera:
1. Estatísticas da época atual (stats_season) — base principal
2. Performance histórica vs este adversário (stats_vs_opponent) — bónus se disponível
3. availability=false = EXCLUÍDO automaticamente, independentemente das stats
4. Equilíbrio da equipa (pontuadores, ressaltadores, distribuidores)

Jogadores (${playerPayload.length} no total):
${JSON.stringify(playerPayload)}

Devolve exatamente este JSON:
{
  "recommended_players": [
    { "player_id": "...", "name": "...", "score": 0-100, "reason": "..." }
  ],
  "excluded_players": [
    { "player_id": "...", "name": "...", "reason": "..." }
  ],
  "tactical_notes": "observações táticas e estratégia sugerida para este jogo"
}`;

  let deepseekRes: Response;
  try {
    deepseekRes = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    console.error("[deepseek/evaluation] fetch error:", err);
    return NextResponse.json(
      { error: "Erro de rede ao contactar DeepSeek" },
      { status: 502 }
    );
  }

  if (!deepseekRes.ok) {
    const errText = await deepseekRes.text().catch(() => "");
    console.error("[deepseek/evaluation] API error:", deepseekRes.status, errText);
    return NextResponse.json(
      { error: `DeepSeek API error ${deepseekRes.status}` },
      { status: 502 }
    );
  }

  const raw = (await deepseekRes.json()) as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const content = raw.choices?.[0]?.message?.content;
  if (!content)
    return NextResponse.json(
      { error: "DeepSeek: resposta sem conteúdo" },
      { status: 502 }
    );

  if (raw.usage) {
    console.log(
      `[deepseek/evaluation] tokens: ${raw.usage.prompt_tokens} prompt + ${raw.usage.completion_tokens} completion`
    );
  }

  let evaluation: {
    recommended_players: Array<{
      player_id: string;
      name: string;
      score: number;
      reason: string;
    }>;
    excluded_players: Array<{
      player_id: string;
      name: string;
      reason: string;
    }>;
    tactical_notes?: string;
  };

  try {
    const jsonMatch =
      content.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ??
      content.match(/(\{[\s\S]+\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content.trim();
    evaluation = JSON.parse(jsonStr);
  } catch (e) {
    console.error(
      "[deepseek/evaluation] JSON parse error:",
      e,
      content.slice(0, 300)
    );
    return NextResponse.json(
      { error: "Resposta da IA inválida — não foi possível interpretar" },
      { status: 502 }
    );
  }

  // Safety: move any late player from recommended to excluded
  const lateInRec = (evaluation.recommended_players ?? []).filter((p) =>
    lateMap.get(p.player_id)
  );
  if (lateInRec.length > 0) {
    evaluation.recommended_players = evaluation.recommended_players.filter(
      (p) => !lateMap.get(p.player_id)
    );
    for (const p of lateInRec) {
      evaluation.excluded_players = [
        ...(evaluation.excluded_players ?? []),
        { ...p, reason: "Quotas em atraso — não elegível para convocatória." },
      ];
    }
  }

  return NextResponse.json({
    ok: true,
    evaluation,
    opponent: opponentDisplay,
    games_with_opponent: pastEventCount,
  });
}
