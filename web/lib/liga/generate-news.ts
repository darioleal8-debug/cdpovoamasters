import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { computeStandings, groupStandingsBySeries, normalizeName } from "@/types/competitions";
import { deepseekJSON } from "@/lib/deepseek";
import { buildNewsFacts, mentionedPlayers, unknownScores, type LiveTeamStats } from "@/lib/game-sheet/news-facts";
import { parseGameMeta } from "@/types/competitions";
import { resolveOurSide } from "@/lib/liga/live-build";
import { aggressiveTerms, NEWS_TONE_RULES } from "@/lib/liga/news-tone";

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
Tom entusiasta mas sóbrio, amistoso e respeitador de todas as equipas. Português europeu (não do Brasil).
Nunca uses linguagem agressiva ou ofensiva (ex.: "atropela", "esmaga", "arrasa", "humilha") — uma vantagem dilatada descreve-se como "vitória folgada", "triunfo claro" ou "vence com autoridade".

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
  "titulo": "título apelativo mas factual e amistoso, sem termos agressivos (máx. 80 caracteres)",
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
  const adminClient = await createUnscopedAdminClient();

  const [eventRes, resultRes, compRes, periodsRes, playerStatsRes] = await Promise.all([
    adminClient.from("events").select("id, title, event_date, location, description").eq("id", gameId).single(),
    adminClient.from("league_game_results").select("*").eq("event_id", gameId).maybeSingle(),
    adminClient.from("competitions").select("id, name").eq("slug", "liga-inatel").single(),
    adminClient.from("league_game_periods").select("periodo, home_points, away_points").eq("event_id", gameId).order("periodo"),
    adminClient.from("league_game_player_stats").select("nome, side, pontos, triplos, lances_livres, source, segundos, dois_pontos, dois_pontos_tent, triplos_tent, lances_livres_tent, ressaltos, assistencias, roubos, perdas, desarmes, eficiencia").eq("event_id", gameId).order("pontos", { ascending: false }),
  ]);
  const { data: reconciliation } = await adminClient
    .from("match_reconciliations")
    .select("status, consolidated")
    .eq("event_id", gameId)
    .maybeSingle();

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
  const dbPlayers = (playerStatsRes.data ?? []) as DbPlayerRow[];
  const live = await loadLiveTeamStats(adminClient, gameId, event.description ?? null);
  const validation = newsValidation(reconciliation as ReconciliationSnapshot | null);
  const facts = buildNewsFacts({
    live,
    boxScores: boxScoresFromDb(dbPlayers),
    validationStatus: validation.label,
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

  return { ok: true as const, adminClient, event, result, submission, facts, jornadaInfo, scoreStr, userPrompt, validation };
}

type DbPlayerRow = {
  nome: string; side: "home" | "away"; pontos: number; triplos: number | null; lances_livres: number | null;
  source?: string | null; segundos?: number | null; dois_pontos?: number | null; dois_pontos_tent?: number | null;
  triplos_tent?: number | null; lances_livres_tent?: number | null; ressaltos?: number | null; assistencias?: number | null;
  roubos?: number | null; perdas?: number | null; desarmes?: number | null; eficiencia?: number | null;
};

/** Box score completo por equipa (estatística profissional consolidada), para os destaques da notícia. */
export function boxScoresFromDb(rows: DbPlayerRow[]): LiveTeamStats[] {
  const out: LiveTeamStats[] = [];
  for (const side of ["home", "away"] as const) {
    const ps = rows.filter((r) => r.side === side);
    const full = ps.length > 0 && ps.every((r) => (r.source === "pro_stats" || r.source === "consolidated") && r.ressaltos != null && r.assistencias != null);
    if (!full) continue;
    out.push({
      side, origin: "pro",
      players: ps.map((r) => ({
        nome: r.nome, pts: r.pontos, reb: r.ressaltos ?? 0, ast: r.assistencias ?? 0, stl: r.roubos ?? 0, blk: r.desarmes ?? 0,
        tov: r.perdas ?? 0, eff: r.eficiencia ?? 0, fg2m: r.dois_pontos ?? 0, fg2a: r.dois_pontos_tent ?? 0,
        fg3m: r.triplos ?? 0, fg3a: r.triplos_tent ?? 0, ftm: r.lances_livres ?? 0, fta: r.lances_livres_tent ?? 0, secs: r.segundos ?? 0,
      })),
    });
  }
  return out;
}

type ReconciliationSnapshot = { status: string; consolidated: { publishable?: boolean } | null };

const VALIDATION_LABELS: Record<string, string> = {
  validated: "validado (submissões das duas equipas coerentes)",
  pending_submission: "validado com a documentação de uma equipa",
  discrepancies: "com divergências por resolver",
  manual_review: "a aguardar revisão manual",
  analyzing: "em análise",
};

/**
 * Regra fundamental: a notícia só é publicada automaticamente quando os dados consolidados
 * são publicáveis (sem divergências relevantes por resolver e com confiança suficiente).
 * Jogos sem validação cruzada (fluxo antigo / live) mantêm o comportamento anterior.
 */
export function newsValidation(r: ReconciliationSnapshot | null): { draft: boolean; label: string | null; status: string | null } {
  if (!r || !r.consolidated) return { draft: false, label: null, status: null };
  const publishable = r.consolidated.publishable === true;
  return { draft: !publishable, label: VALIDATION_LABELS[r.status] ?? r.status, status: r.status };
}

/** Prompts por defeito de um jogo, para o admin os ver e editar antes de gerar. */
export async function getDefaultNewsPrompts(
  gameId: string
): Promise<{ ok: true; system: string; user: string; format: string } | { ok: false; error: string }> {
  const prep = await prepareNews(gameId);
  if (!prep.ok) return prep;
  return { ok: true, system: NEWS_STYLE, user: prep.userPrompt, format: `${NEWS_TONE_RULES}\n\n${NEWS_FORMAT}` };
}

export async function generateLigaNews(
  gameId: string,
  overrides: NewsPromptOverrides = {}
): Promise<{ ok: true; news_id: string; newsContext: NewsContext; draft: boolean } | { ok: false; error: string }> {
  const prep = await prepareNews(gameId);
  if (!prep.ok) return prep;
  const { adminClient, event, result, submission, facts, jornadaInfo, scoreStr, userPrompt: defaultUserPrompt, validation } = prep;
  const draft = validation.draft;

  const customSystem = overrides.systemPrompt?.trim() ?? "";
  const customUser = overrides.userPrompt?.trim() ?? "";
  const system = `${customSystem || NEWS_STYLE}\n\n${NEWS_TONE_RULES}\n\n${NEWS_FORMAT}`;
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
  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < 3 && !newsData; attempt++) {
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
    // Tom amistoso: sem termos agressivos/ofensivos (ex.: "atropela")
    const badTone = aggressiveTerms(text);
    if (bad.length === 0 && badPlayers.length === 0 && badTone.length === 0) {
      newsData = aiResult.data;
    } else {
      console.warn(`[generateLigaNews] texto rejeitado (pontuações: ${bad.join(", ") || "-"}; jogadores: ${badPlayers.join(", ") || "-"}; tom: ${badTone.join(", ") || "-"}) — nova tentativa`);
      const issues: string[] = [];
      if (bad.length) issues.push(`citou pontuações que não constam dos factos (${bad.join(", ")})`);
      if (badPlayers.length) issues.push(`mencionou jogadores (${badPlayers.join(", ")}) quando os pontos individuais não são fiáveis — não menciones nenhum jogador nem pontuações individuais`);
      lastIssues = [
        ...(bad.length ? [`pontuações não verificadas: ${bad.join(", ")}`] : []),
        ...(badPlayers.length ? [`jogadores com pontos não fiáveis: ${badPlayers.join(", ")}`] : []),
        ...(badTone.length ? [`linguagem agressiva: ${badTone.join(", ")}`] : []),
      ];
      if (badTone.length) issues.push(`usou linguagem agressiva/ofensiva (${badTone.join(", ")}) — reescreve com tom amistoso, ex.: "vitória folgada", "triunfo claro", "vence com autoridade"`);
      feedback = `\n\nATENÇÃO: a versão anterior ${issues.join(" e ")}. Corrige.`;
    }
  }
  if (!newsData) {
    return { ok: false, error: `A notícia gerada foi rejeitada (${lastIssues.join("; ")}). Gere novamente, ajuste o prompt ou use "✍ Escrever manualmente".` };
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
        // Dados com divergências por resolver: volta a rascunho até o admin validar
        ...(draft ? { is_published: false } : {}),
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
        is_published: !draft,
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

  if (draft) console.info(`[generateLigaNews] notícia em RASCUNHO (validação: ${validation.status}) game_id=${gameId}`);
  return {
    ok: true,
    news_id,
    draft,
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

/**
 * Estatística registada ao vivo no HoopHub (jogo finalizado) para a notícia:
 * linhas por jogador da equipa que fez o live, orientadas ao lado da liga.
 */
async function loadLiveTeamStats(
  db: Awaited<ReturnType<typeof createUnscopedAdminClient>>,
  gameId: string,
  description: string | null
): Promise<LiveTeamStats | null> {
  try {
    const { data: sess } = await db.from("game_sessions")
      .select("id, status").eq("event_id", gameId).eq("status", "finished").maybeSingle();
    if (!sess) return null;
    const { data: stats } = await db.from("player_game_stats")
      .select("player_id, pts, reb_off, reb_def, ast, stl, blk, tov, efficiency, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, seconds_played")
      .eq("game_session_id", sess.id);
    if (!stats?.length) return null;
    const ids = stats.map((s) => s.player_id as string);
    const { data: roster } = await db.from("v_roster_public").select("player_id, name").in("player_id", ids);
    const nameById = new Map((roster ?? []).map((r) => [r.player_id as string, r.name as string]));
    const { data: ourTeam } = await db.from("league_teams").select("name").eq("is_our_team", true).maybeSingle();
    const side = resolveOurSide(parseGameMeta(description), ourTeam?.name ?? "CD Póvoa");
    const players = stats
      .filter((s) => nameById.get(s.player_id as string))
      .map((s) => ({
        nome: nameById.get(s.player_id as string)!,
        pts: s.pts ?? 0, reb: (s.reb_off ?? 0) + (s.reb_def ?? 0), ast: s.ast ?? 0, stl: s.stl ?? 0,
        blk: s.blk ?? 0, tov: s.tov ?? 0, eff: Math.round(Number(s.efficiency ?? 0)),
        fg2m: s.fg2_made ?? 0, fg2a: s.fg2_att ?? 0, fg3m: s.fg3_made ?? 0, fg3a: s.fg3_att ?? 0,
        ftm: s.ft_made ?? 0, fta: s.ft_att ?? 0, secs: s.seconds_played ?? 0,
      }));
    return players.length ? { side, players } : null;
  } catch (e) {
    console.error("[generateLigaNews] estatística live indisponível", e);
    return null;
  }
}
