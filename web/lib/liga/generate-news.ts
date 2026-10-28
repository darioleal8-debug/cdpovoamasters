import { createAdminClient } from "@/lib/supabase/server";
import { computeStandings, groupStandingsBySeries, normalizeName } from "@/types/competitions";
import { deepseekJSON } from "@/lib/deepseek";
import { buildNewsFacts, mentionedPlayers, unknownScores } from "@/lib/game-sheet/news-facts";

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

/** Parte editável pelo admin: tom, estrutura e restrições editoriais. */
export const NEWS_STYLE = `Escreves notícias de jornalismo desportivo local em português de Portugal sobre basquetebol da Liga INATEL Masters.
Usa APENAS os factos fornecidos — nunca inventes dados.
Tom entusiasta mas sóbrio. Português europeu (não do Brasil).

Estrutura do corpo (proporcional aos dados disponíveis — omite secções sem factos):
1. Introdução: equipas, competição, data e local.
2. Resumo do encontro e evolução do marcador por período (só com os parciais fornecidos).
3. Momentos decisivos — apenas os que os factos demonstram (ex.: maior parcial, reviravolta no último período).
4. Destaques individuais — apenas marcadores confirmados, com o total exato.
5. Contexto da competição/classificação, se fornecido.
6. Conclusão sobre o impacto do resultado.

PROIBIDO inventar: declarações de jogadores ou treinadores, lesões, arbitragem, táticas, emoções, corridas de pontos
dentro de um período, estatísticas não fornecidas, consequências competitivas não indicadas. Não cites pontuações que
não constem dos factos.`;

/** Formato de resposta: fixo (a aplicação precisa de JSON), acrescentado a qualquer prompt. */
export const NEWS_FORMAT = `Responde APENAS com JSON válido (sem markdown) com este esquema:
{
  "titulo": "título apelativo mas factual (máx. 80 caracteres)",
  "entrada": "1-2 frases de entrada/lide com o resultado (máx. 200 caracteres; serve também de descrição SEO)",
  "corpo": "corpo da notícia, 120-400 palavras, em parágrafos separados por linha em branco"
}`;

export type NewsPromptOverrides = {
  /** Substitui as instruções editoriais (NEWS_STYLE). O formato JSON é sempre acrescentado. */
  systemPrompt?: string;
  /** Substitui o pedido completo (factos + regras) enviado ao modelo. */
  userPrompt?: string;
};

async function prepareNews(gameId: string) {
  const adminClient = await createAdminClient();

  const [eventRes, resultRes, compRes, periodsRes, playerStatsRes] = await Promise.all([
    adminClient.from("events").select("id, title, event_date, location, description").eq("id", gameId).single(),
    adminClient.from("league_game_results").select("*").eq("event_id", gameId).maybeSingle(),
    adminClient.from("competitions").select("id, name").eq("slug", "liga-inatel").single(),
    adminClient.from("league_game_periods").select("periodo, home_points, away_points").eq("event_id", gameId).order("periodo"),
    adminClient.from("league_game_player_stats").select("nome, side, pontos, triplos, lances_livres").eq("event_id", gameId).order("pontos", { ascending: false }),
  ]);

  const event = eventRes.data;
  const result = resultRes.data;
  if (!event || !result) {
    console.error(`[generateLigaNews] jogo ou resultado não encontrado para game_id=${gameId}`);
    return { ok: false as const, error: "Jogo ou resultado não encontrado" };
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
    .map((s, i) => `${i + 1}. ${s.team_name} — ${s.pts} pts (${s.wins}V ${s.draws}E ${s.losses}D)`)
    .join("\n");

  const { data: submission } = await adminClient
    .from("result_submissions")
    .select("id, extraction_raw, notes")
    .eq("event_id", gameId)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  // Submissões antigas sem estatísticas na BD: jogadores vindos da extração revista
  type RawPlayer = { nome: string; pontos: number; equipa: string };
  let rawPlayers: { nome: string; side: "home" | "away"; pontos: number }[] = [];
  if (submission?.extraction_raw) {
    try {
      const raw = submission.extraction_raw as { jogadores?: RawPlayer[] };
      rawPlayers = (raw.jogadores ?? []).map((j) => {
        const eq = normalizeName(j.equipa ?? "");
        // equipa não identificável → lado inválido, a soma não bate e os pontos são descartados
        const side = eq === homeNorm ? "home" : eq === awayNorm ? "away" : ("?" as "home");
        return { nome: j.nome, side, pontos: Number(j.pontos) || 0 };
      });
    } catch { /* ignore */ }
  }

  // Factos determinísticos a partir dos dados aprovados (fonte de verdade)
  const periods = (periodsRes.data ?? []) as { periodo: number; home_points: number; away_points: number }[];
  const dbPlayers = (playerStatsRes.data ?? []) as { nome: string; side: "home" | "away"; pontos: number; triplos: number | null; lances_livres: number | null }[];
  const facts = buildNewsFacts({
    home: result.home_team_name,
    away: result.away_team_name,
    homeScore: result.home_score,
    awayScore: result.away_score,
    periods,
    players: dbPlayers.length > 0 ? dbPlayers : rawPlayers,
    unattributed: result.home_unattributed_points != null || result.away_unattributed_points != null
      ? { home: result.home_unattributed_points ?? null, away: result.away_unattributed_points ?? null }
      : null,
  });

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

FACTOS VERIFICADOS:
${facts.lines.join("\n")}
${submission?.notes ? `Notas: ${submission.notes}` : ""}
${photoCaptions ? `Descrição das fotografias do jogo: ${photoCaptions}` : ""}

${standingsTitle}:
${top5}

Regras:
- Menciona o contexto da jornada e o impacto na classificação se relevante (a classificação é por série — refere a série, ex.: "na Série B", e nunca compares com equipas de outras séries)
- Usa APENAS os dados fornecidos acima — nunca inventes pontuações, nomes ou factos`;

  return { ok: true as const, adminClient, event, result, submission, facts, jornadaInfo, scoreStr, userPrompt };
}

/** Prompts por defeito de um jogo, para o admin os ver e editar antes de gerar. */
export async function getDefaultNewsPrompts(
  gameId: string
): Promise<{ ok: true; system: string; user: string; format: string } | { ok: false; error: string }> {
  const prep = await prepareNews(gameId);
  if (!prep.ok) return prep;
  return { ok: true, system: NEWS_STYLE, user: prep.userPrompt, format: NEWS_FORMAT };
}

export async function generateLigaNews(
  gameId: string,
  overrides: NewsPromptOverrides = {}
): Promise<{ ok: true; news_id: string; newsContext: NewsContext } | { ok: false; error: string }> {
  const prep = await prepareNews(gameId);
  if (!prep.ok) return prep;
  const { adminClient, event, result, submission, facts, jornadaInfo, scoreStr, userPrompt: defaultUserPrompt } = prep;

  const customSystem = overrides.systemPrompt?.trim() ?? "";
  const customUser = overrides.userPrompt?.trim() ?? "";
  const system = `${customSystem || NEWS_STYLE}\n\n${NEWS_FORMAT}`;
  const userPrompt = customUser || defaultUserPrompt;

  // Pontuações escritas pelo próprio admin no prompt contam como factos permitidos
  const allowedScores = new Set(facts.allowedScores);
  for (const sc of unknownScores(`${customSystem}\n${customUser}`, new Set())) {
    const [a, b] = sc.split("-");
    allowedScores.add(`${a}-${b}`);
    allowedScores.add(`${b}-${a}`);
  }

  const adminText = `${customSystem}\n${customUser}`;
  const forbiddenNames = facts.forbiddenPlayerNames.filter((n) => mentionedPlayers(adminText, [n]).length === 0);

  type NewsJSON = { titulo?: string; entrada?: string; corpo?: string };
  let newsData: NewsJSON | null = null;
  let feedback = "";
  for (let attempt = 0; attempt < 2 && !newsData; attempt++) {
    const aiResult = await deepseekJSON<NewsJSON>({
      system,
      user: userPrompt + feedback,
      maxTokens: 4096,
      temperature: attempt === 0 ? 0.4 : 0.2,
    });
    if (!aiResult.ok) {
      console.error(`[generateLigaNews] deepseekJSON failed: ${aiResult.error}`);
      return { ok: false, error: aiResult.error };
    }
    // Verificação: o texto não pode citar pontuações que não constam dos factos
    const text = `${aiResult.data.titulo ?? ""}\n${aiResult.data.entrada ?? ""}\n${aiResult.data.corpo ?? ""}`;
    const bad = unknownScores(text, allowedScores);
    // Leitura individual não fiável: a notícia não pode referir jogadores (salvo se o admin os escreveu no prompt)
    const badPlayers = mentionedPlayers(text, forbiddenNames);
    if (bad.length === 0 && badPlayers.length === 0) {
      newsData = aiResult.data;
    } else {
      console.warn(`[generateLigaNews] dados não verificados no texto (pontuações: ${bad.join(", ") || "-"}; jogadores: ${badPlayers.join(", ") || "-"}) — nova tentativa`);
      const issues: string[] = [];
      if (bad.length) issues.push(`citou pontuações que não constam dos factos (${bad.join(", ")})`);
      if (badPlayers.length) issues.push(`mencionou jogadores (${badPlayers.join(", ")}) quando os pontos individuais não são fiáveis — não menciones nenhum jogador nem pontuações individuais`);
      feedback = `\n\nATENÇÃO: a versão anterior ${issues.join(" e ")}. Corrige.`;
    }
  }
  if (!newsData) {
    return { ok: false, error: "A notícia gerada citava dados não verificados (pontuações ou jogadores) — gere novamente ou escreva manualmente." };
  }

  let titulo = (newsData.titulo ?? "").trim();
  const corpo = (newsData.corpo ?? "").trim();

  if (!titulo || !corpo) {
    const msg = `DeepSeek não devolveu notícia válida (titulo=${!!titulo}, corpo=${!!corpo})`;
    console.error(`[generateLigaNews] ${msg}`);
    return { ok: false, error: msg };
  }

  if (titulo.length > 80) titulo = titulo.slice(0, 80);
  const entrada = (newsData.entrada ?? "").trim().slice(0, 200);

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
        excerpt: entrada,
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
        excerpt: entrada,
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
      excerpt: entrada,
      homeTeamName: result.home_team_name,
      awayTeamName: result.away_team_name,
      scoreStr,
      jornadaInfo,
    },
  };
}
