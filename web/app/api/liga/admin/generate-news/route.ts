import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { computeStandings } from "@/types/competitions";

const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-flash";

// POST /api/liga/admin/generate-news
// Gera notícia para um jogo aprovado. Idempotente (upsert por game_id).
export async function POST(req: Request) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "DEEPSEEK_API_KEY não configurada" }, { status: 500 });

  const { game_id } = (await req.json()) as { game_id: string };
  if (!game_id) return NextResponse.json({ error: "game_id obrigatório" }, { status: 400 });

  const adminClient = await createAdminClient();

  // Buscar dados do jogo + resultado
  const [eventRes, resultRes, compRes] = await Promise.all([
    adminClient.from("events").select("id, title, event_date, location, description").eq("id", game_id).single(),
    adminClient.from("league_game_results").select("*").eq("event_id", game_id).maybeSingle(),
    adminClient.from("competitions").select("id, name").eq("slug", "liga-inatel").single(),
  ]);

  const event = eventRes.data;
  const result = resultRes.data;
  if (!event || !result) return NextResponse.json({ error: "Jogo ou resultado não encontrado" }, { status: 404 });

  // Classificação actualizada
  const { data: allResults } = await adminClient
    .from("league_game_results")
    .select("home_team_name, away_team_name, home_score, away_score")
    .eq("competition_id", result.competition_id ?? compRes.data?.id ?? "");

  const standings = computeStandings(allResults ?? []);
  const top5 = standings.slice(0, 5)
    .map((s, i) => `${i + 1}. ${s.team_name} — ${s.pts} pts (${s.wins}V ${s.losses}D)`)
    .join("\n");

  // Melhores marcadores da submissão original
  const { data: submission } = await adminClient
    .from("result_submissions")
    .select("extraction_raw, notes")
    .eq("event_id", game_id)
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

  // Informação da jornada
  let jornadaInfo = "";
  try {
    const meta = JSON.parse(event.description ?? "{}") as { jornada?: number; volta?: number; serie?: string };
    jornadaInfo = `Jornada ${meta.jornada ?? "?"}, Volta ${meta.volta ?? "?"}, Série ${meta.serie ?? "A"}`;
  } catch { /* ignore */ }

  const homeWon = result.home_score > result.away_score;
  const winner = homeWon ? result.home_team_name : result.away_team_name;
  const loser = homeWon ? result.away_team_name : result.home_team_name;
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
    return NextResponse.json({ error: `DeepSeek error ${res.status}: ${t}` }, { status: 502 });
  }

  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let news: { titulo?: string; entrada?: string; corpo?: string } = {};
  try { news = JSON.parse(raw); } catch { /* ignore */ }

  if (!news.titulo || !news.corpo)
    return NextResponse.json({ error: "DeepSeek não devolveu notícia válida", raw }, { status: 502 });

  // Upsert idempotente
  const { data: upserted, error: upsertErr } = await adminClient
    .from("noticias")
    .upsert({
      game_id,
      competition_id: result.competition_id ?? compRes.data?.id ?? null,
      titulo: news.titulo,
      entrada: news.entrada ?? "",
      corpo: news.corpo,
      estado: "publicado",
      extraction_raw: submission?.extraction_raw ?? null,
      extraction_final: { home_score: result.home_score, away_score: result.away_score },
      publicado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "game_id" })
    .select("id")
    .single();

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, noticia_id: upserted?.id });
}
