import { createAdminClient } from "@/lib/supabase/server";
import { computeStandings } from "@/types/competitions";

const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-flash";

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

export async function generateLigaNews(
  gameId: string
): Promise<{ ok: true; news_id: string } | { ok: false; error: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, error: "DEEPSEEK_API_KEY não configurada" };

  const adminClient = await createAdminClient();

  const [eventRes, resultRes, compRes] = await Promise.all([
    adminClient.from("events").select("id, title, event_date, location, description").eq("id", gameId).single(),
    adminClient.from("league_game_results").select("*").eq("event_id", gameId).maybeSingle(),
    adminClient.from("competitions").select("id, name").eq("slug", "liga-inatel").single(),
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

  const standings = computeStandings(allResults ?? []);
  const top5 = standings
    .slice(0, 5)
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

  let jornadaInfo = "";
  try {
    const meta = JSON.parse(event.description ?? "{}") as { jornada?: number; volta?: number; serie?: string };
    jornadaInfo = `Jornada ${meta.jornada ?? "?"}, Volta ${meta.volta ?? "?"}, Série ${meta.serie ?? "A"}`;
  } catch { /* ignore */ }

  const homeWon = result.home_score > result.away_score;
  const winner = homeWon ? result.home_team_name : result.away_team_name;
  const scoreStr = `${result.home_score}-${result.away_score}`;

  const prompt = `Escreve uma notícia de jornalismo desportivo local, em português de Portugal, sobre o seguinte resultado de basquetebol da Liga INATEL Masters.

JOGO: ${result.home_team_name} ${scoreStr} ${result.away_team_name}
Vencedor: ${winner}
Data: ${event.event_date}
Local: ${event.location ?? "não especificado"}
${jornadaInfo}
${topScorers ? `Destaques: ${topScorers}` : ""}
${submission?.notes ? `Notas: ${submission.notes}` : ""}

CLASSIFICAÇÃO ACTUALIZADA (top 5):
${top5}

Regras:
- Usa APENAS os factos fornecidos (nada inventado)
- Português de Portugal (não do Brasil)
- Tom de jornalismo desportivo local, entusiasta mas sóbrio
- Menciona o contexto da jornada e o impacto na classificação se relevante

Responde com JSON:
{
  "titulo": "título da notícia (máx. 80 caracteres)",
  "entrada": "1-2 frases de entrada/lide",
  "corpo": "corpo da notícia, 150-250 palavras"
}`;

  const res = await fetch(DEEPSEEK_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    const msg = `DeepSeek error ${res.status}: ${t.slice(0, 200)}`;
    console.error(`[generateLigaNews] ${msg}`);
    return { ok: false, error: msg };
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const rawContent = json.choices?.[0]?.message?.content ?? "{}";
  let newsData: { titulo?: string; entrada?: string; corpo?: string } = {};
  try { newsData = JSON.parse(rawContent); } catch { /* ignore */ }

  if (!newsData.titulo || !newsData.corpo) {
    const msg = `DeepSeek não devolveu notícia válida: ${rawContent.slice(0, 200)}`;
    console.error(`[generateLigaNews] ${msg}`);
    return { ok: false, error: msg };
  }

  // Slug determinístico: liga-inatel-{equipa_casa}-{equipa_fora}-{data}
  const datePart = event.event_date.slice(0, 10);
  const slug = `liga-inatel-${slugify(result.home_team_name)}-${slugify(result.away_team_name)}-${datePart}`;

  // Check-then-write idempotente por game_id
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
        title: newsData.titulo,
        excerpt: newsData.entrada ?? "",
        body: newsData.corpo,
        home_team_name: result.home_team_name,
        away_team_name: result.away_team_name,
        source_submission_id: submission?.id ?? null,
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
        title: newsData.titulo,
        excerpt: newsData.entrada ?? "",
        body: newsData.corpo,
        category: "Liga INATEL",
        home_team_name: result.home_team_name,
        away_team_name: result.away_team_name,
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

  return { ok: true, news_id };
}
