import { createAdminClient } from "@/lib/supabase/server";
import { computeStandings, groupStandingsBySeries, normalizeName } from "@/types/competitions";
import { deepseekJSON } from "@/lib/deepseek";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export type NewsContext = {
  title: string;
  excerpt: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  scoreStr: string;
  jornadaInfo: string;
};

const NEWS_SYSTEM = `Escreves notícias de jornalismo desportivo local em português de Portugal sobre basquetebol da Liga INATEL Masters.
Usa APENAS os factos fornecidos — nunca inventes dados.
Tom entusiasta mas sóbrio. Português europeu (não do Brasil).

Responde APENAS com JSON válido (sem markdown) com este esquema:
{
  "titulo": "título da notícia (máx. 80 caracteres)",
  "entrada": "1-2 frases de entrada/lide",
  "corpo": "corpo da notícia, 150-250 palavras"
}`;

export async function generateLigaNews(
  gameId: string
): Promise<{ ok: true; news_id: string; newsContext: NewsContext } | { ok: false; error: string }> {
  const adminClient = await createAdminClient();

  const [eventRes, resultRes, compRes, periodsRes, playerStatsRes] = await Promise.all([
    adminClient.from("events").select("id, title, event_date, location, description").eq("id", gameId).single(),
    adminClient.from("league_game_results").select("*").eq("event_id", gameId).maybeSingle(),
    adminClient.from("competitions").select("id, name").eq("slug", "liga-inatel").single(),
    adminClient.from("league_game_periods").select("periodo, home_points, away_points").eq("event_id", gameId).order("periodo"),
    adminClient.from("league_game_player_stats").select("nome, side, pontos").eq("event_id", gameId).order("pontos", { ascending: false }),
  ]);

  const event = eventRes.data;
  const result = resultRes.data;
  if (!event || !result) {
    console.error(`[generateLigaNews] jogo ou resultado não encontrado para game_id=${gameId}`);
    return { ok: false, error: "Jogo ou resultado não encontrado" };
  }

  const { data: allResults } = await adminClient
    .from("league_game_results")
    .select("home_team_name, away_team_name, home_score, away_score")
    .eq("competition_id", result.competition_id ?? compRes.data?.id ?? "");

  // Classificação por série: só a série das equipas deste jogo interessa à notícia
  const competitionId = result.competition_id ?? compRes.data?.id ?? "";
  const { data: stRows } = await adminClient
    .from("season_teams")
    .select("team_id, series, team:league_teams(id, name, normalized_name)")
    .eq("competition_id", competitionId)
    .eq("active", true);

  type StRow = { team_id: string; series: string | null; team: { id: string; name: string; normalized_name: string } | null };
  const seasonRows = ((stRows ?? []) as unknown as StRow[]).filter((r) => r.team);
  const seedTeams = seasonRows.map((r) => r.team!);
  const seriesByTeamId = new Map(seasonRows.map((r) => [r.team_id, r.series ?? null]));

  const standings = computeStandings(allResults ?? [], seedTeams.length > 0 ? seedTeams : undefined);
  const groups = groupStandingsBySeries(standings, seriesByTeamId);

  const homeNorm = normalizeName(result.home_team_name ?? "");
  const awayNorm = normalizeName(result.away_team_name ?? "");
  const seriesOf = (norm: string) =>
    groups.find((g) => g.rows.some((r) => normalizeName(r.team_name) === norm))?.series ?? null;
  const gameSeries = seriesOf(homeNorm) ?? seriesOf(awayNorm);
  const gameGroup = groups.find((g) => g.series === gameSeries && g.series !== null);

  const standingsRows = gameGroup ? gameGroup.rows : standings.slice(0, 5);
  const standingsTitle = gameGroup
    ? `CLASSIFICAÇÃO ACTUALIZADA DA ${gameGroup.label.toUpperCase()} (o jogo pertence à ${gameGroup.label}; a liga tem ${groups.filter((g) => g.series).length} séries)`
    : "CLASSIFICAÇÃO ACTUALIZADA (top 5)";
  const top5 = standingsRows
    .map((s, i) => `${i + 1}. ${s.team_name} — ${s.pts} pts (${s.wins}V ${s.losses}D)`)
    .join("\n");

  const { data: submission } = await adminClient
    .from("result_submissions")
    .select("id, extraction_raw, notes")
    .eq("event_id", gameId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let topScorers = "";
  if (submission?.extraction_raw) {
    try {
      const raw = submission.extraction_raw as { jogadores?: { nome: string; pontos: number; equipa: string }[] };
      const sorted = (raw.jogadores ?? [])
        .filter((j) => j.pontos > 0)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 4);
      if (sorted.length > 0)
        topScorers = sorted.map((j) => `${j.nome} (${j.pontos} pts, ${j.equipa})`).join(", ");
    } catch { /* ignore */ }
  }

  // Parciais vindos da DB (fonte de verdade após aprovação)
  const periods = (periodsRes.data ?? []) as { periodo: number; home_points: number; away_points: number }[];
  let periodsBlock = "";
  let decisivePeriodLine = "";
  if (periods.length > 0) {
    let cumHome = 0;
    let cumAway = 0;
    const lines: string[] = ["PARCIAIS (casa | fora | acumulado):"];
    let maxSwing = 0;
    let decisivePeriod = 0;
    let decisiveDesc = "";
    for (const p of periods) {
      cumHome += p.home_points;
      cumAway += p.away_points;
      lines.push(`P${p.periodo}: ${p.home_points} | ${p.away_points} | ${cumHome}-${cumAway}`);
      const swing = p.home_points - p.away_points;
      if (Math.abs(swing) > Math.abs(maxSwing)) {
        maxSwing = swing;
        decisivePeriod = p.periodo;
        const side = swing > 0 ? "casa" : "fora";
        decisiveDesc = `P${p.periodo} (${side} +${Math.abs(swing)}, ${cumHome}-${cumAway} acumulado)`;
      }
    }
    periodsBlock = lines.join("\n");
    if (decisivePeriod > 0) decisivePeriodLine = `Período decisivo: ${decisiveDesc}`;
  }

  // Top marcadores por equipa (DB tem prioridade; fallback para extraction_raw)
  const dbPlayers = (playerStatsRes.data ?? []) as { nome: string; side: string; pontos: number }[];
  let topScorersByTeamBlock = "";
  if (dbPlayers.length > 0) {
    const homeTop = dbPlayers.filter((j) => j.side === "home" && j.pontos > 0).slice(0, 3);
    const awayTop = dbPlayers.filter((j) => j.side === "away" && j.pontos > 0).slice(0, 3);
    const parts: string[] = [];
    if (homeTop.length > 0) parts.push(`Casa: ${homeTop.map((j) => `${j.nome} (${j.pontos} pts)`).join(", ")}`);
    if (awayTop.length > 0) parts.push(`Fora: ${awayTop.map((j) => `${j.nome} (${j.pontos} pts)`).join(", ")}`);
    if (parts.length > 0) topScorersByTeamBlock = `Marcadores por equipa:\n${parts.join("\n")}`;
  } else if (topScorers) {
    topScorersByTeamBlock = `Destaques: ${topScorers}`;
  }

  let jornadaInfo = "";
  try {
    const meta = JSON.parse(event.description ?? "{}") as { jornada?: number; volta?: number; serie?: string };
    jornadaInfo = `Jornada ${meta.jornada ?? "?"}, Volta ${meta.volta ?? "?"}, Série ${meta.serie ?? "A"}`;
  } catch { /* ignore */ }

  let photoCaptions = "";
  try {
    const { data: gamePics } = await adminClient
      .from("game_photos")
      .select("caption")
      .eq("game_id", gameId)
      .eq("hidden", false)
      .not("caption", "is", null)
      .order("created_at", { ascending: true });
    const caps = (gamePics ?? []).map((p: { caption: string | null }) => p.caption).filter(Boolean) as string[];
    if (caps.length > 0) photoCaptions = caps.join(" / ");
  } catch { /* ignorar se tabela não existe ainda */ }

  const homeWon = result.home_score > result.away_score;
  const winner = homeWon ? result.home_team_name : result.away_team_name;
  const scoreStr = `${result.home_score}-${result.away_score}`;

  const userPrompt = `JOGO: ${result.home_team_name} ${scoreStr} ${result.away_team_name}
Vencedor: ${winner}
Data: ${event.event_date}
Local: ${event.location ?? "não especificado"}
${jornadaInfo}
${periodsBlock ? `\n${periodsBlock}` : ""}
${decisivePeriodLine ? decisivePeriodLine : ""}
${topScorersByTeamBlock ? `\n${topScorersByTeamBlock}` : ""}
${submission?.notes ? `Notas: ${submission.notes}` : ""}
${photoCaptions ? `Descrição das fotografias do jogo: ${photoCaptions}` : ""}

${standingsTitle}:
${top5}

Regras:
- Menciona o contexto da jornada e o impacto na classificação se relevante (a classificação é por série — refere a série, ex.: "na Série B", e nunca compares com equipas de outras séries)
- Usa APENAS os dados fornecidos acima — nunca inventes pontuações, nomes ou factos`;

  const aiResult = await deepseekJSON<{ titulo?: string; entrada?: string; corpo?: string }>({
    system: NEWS_SYSTEM,
    user: userPrompt,
    maxTokens: 4096,
    temperature: 0.4,
  });

  if (!aiResult.ok) {
    console.error(`[generateLigaNews] deepseekJSON failed: ${aiResult.error}`);
    return { ok: false, error: aiResult.error };
  }

  const newsData = aiResult.data;

  let titulo = (newsData.titulo ?? "").trim();
  const corpo = (newsData.corpo ?? "").trim();

  if (!titulo || !corpo) {
    const msg = `DeepSeek não devolveu notícia válida (titulo=${!!titulo}, corpo=${!!corpo})`;
    console.error(`[generateLigaNews] ${msg}`);
    return { ok: false, error: msg };
  }

  if (titulo.length > 80) titulo = titulo.slice(0, 80);

  const datePart = event.event_date.slice(0, 10);
  const slug = `liga-inatel-${slugify(result.home_team_name)}-${slugify(result.away_team_name)}-${datePart}`;

  const { data: existing } = await adminClient
    .from("news")
    .select("id")
    .eq("game_id", gameId)
    .maybeSingle();

  let news_id: string;

  if (existing) {
    const { error } = await adminClient
      .from("news")
      .update({
        title: titulo,
        excerpt: newsData.entrada ?? "",
        body: corpo,
        home_team_name: result.home_team_name,
        away_team_name: result.away_team_name,
        source_submission_id: submission?.id ?? null,
        image_status: "pending",
      })
      .eq("id", existing.id);
    if (error) {
      console.error(`[generateLigaNews] update error: ${error.message}`);
      return { ok: false, error: error.message };
    }
    news_id = existing.id;
  } else {
    const { data: inserted, error } = await adminClient
      .from("news")
      .insert({
        slug,
        game_id: gameId,
        source_submission_id: submission?.id ?? null,
        title: titulo,
        excerpt: newsData.entrada ?? "",
        body: corpo,
        category: "Liga INATEL",
        home_team_name: result.home_team_name,
        away_team_name: result.away_team_name,
        image_status: "pending",
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      console.error(`[generateLigaNews] insert error: ${error.message}`);
      return { ok: false, error: error.message };
    }
    news_id = inserted!.id;
  }

  return {
    ok: true,
    news_id,
    newsContext: {
      title: titulo,
      excerpt: newsData.entrada ?? "",
      homeTeamName: result.home_team_name,
      awayTeamName: result.away_team_name,
      scoreStr,
      jornadaInfo,
    },
  };
}
