import { NextResponse } from "next/server";
import { createClient as createServerClient, createAdminClient } from "@/lib/supabase/server";
import { getSeriesByTeamId, getLatestNoticias } from "@/lib/competitions-data";

export const runtime = "nodejs";
// Cache de 10 minutos — dados públicos de resumo, não contêm dados privados
export const revalidate = 600;

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (days >= 2)  return `há ${days} dias`;
  if (days === 1) return "há 1 dia";
  if (hours >= 2) return `há ${hours} horas`;
  if (hours === 1) return "há 1 hora";
  if (mins >= 2)  return `há ${mins} minutos`;
  return "agora mesmo";
}

type PublicLeague = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  teamCount: number;
  seriesCount: number;
  lastActivityLabel: string;
};

// Ligas públicas (competitions.is_public) — independentes de haver clubes públicos
async function getPublicLeagues(): Promise<PublicLeague[]> {
  try {
    const admin = await createAdminClient();
    const { data: comps } = await admin
      .from("competitions")
      .select("id, name, slug, logo_url")
      .eq("is_public", true)
      .order("created_at", { ascending: true })
      .limit(10);

    return await Promise.all(
      (comps ?? []).map(async (c) => {
        const seriesMap = await getSeriesByTeamId(c.id);
        let teamCount = seriesMap.size;
        if (teamCount === 0) {
          const { count } = await admin
            .from("league_teams")
            .select("id", { count: "exact", head: true })
            .eq("is_placeholder", false);
          teamCount = count ?? 0;
        }
        const seriesCount = new Set(
          [...seriesMap.values()].filter((v): v is string => !!v)
        ).size;

        let lastActivityLabel = "Classificação, calendário e resultados";
        if (c.slug === "liga-inatel") {
          const [latest] = await getLatestNoticias(1);
          if (latest) {
            const when = latest.published_at ?? latest.created_at;
            lastActivityLabel = `${latest.title} · ${relativeTime(when)}`;
          }
        }

        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          logo_url: c.logo_url ?? (c.slug === "liga-inatel" ? "/pwa/liga-inatel-192.png" : null),
          teamCount,
          seriesCount,
          lastActivityLabel,
        };
      })
    );
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const activeLeagues = await getPublicLeagues();

    // ── Clubes públicos ───────────────────────────────────────────────────────
    // Apenas clubes com is_public = true (opt-in; false por defeito)
    // A tabela club_settings tem uma linha por clube.
    const { data: publicClubs } = await supabase
      .from("club_settings")
      .select("id, club_name, logo_url, is_public, slug")
      .eq("is_public", true)
      .limit(10);

    const clubs = publicClubs ?? [];
    const clubCount  = clubs.length;

    // Sem clubes públicos → retorna counts e array vazio
    if (clubCount === 0) {
      return NextResponse.json(
        { clubCount: 0, leagueCount: activeLeagues.length, activeClubs: [], activeLeagues },
        { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=300" } }
      );
    }

    // ── Resultados recentes para cada clube público ────────────────────────
    // Só resultados (finished), ordenados por data desc
    const clubIds = clubs.map((c) => c.id);

    // Inclui game_type do evento para excluir jogos de treino (friendly)
    // da contagem de vitórias/derrotas — apenas jogos oficiais contam.
    const { data: recentGames } = await supabase
      .from("game_sessions")
      .select("id, status, home_score, away_score, opponent_name, is_home_game, created_at, season_id, event:events(game_type)")
      .in("status", ["finished"])
      .order("created_at", { ascending: false })
      .limit(50);

    // ── Épocas activas ─────────────────────────────────────────────────────
    const { data: seasons } = await supabase
      .from("seasons")
      .select("id, name, year")
      .eq("status", "ativa")
      .limit(5);

    const activeSeasonIds = new Set((seasons ?? []).map((s) => s.id));

    // ── Monta resposta por clube ────────────────────────────────────────────
    const leagueSet = new Set<string>();

    const activeClubs = clubs.slice(0, 3).map((club) => {
      // Jogos desta época activa para este clube
      // Apenas jogos oficiais desta época activa — friendly não conta para W/L
      const games = (recentGames ?? []).filter((g) => {
        if (!activeSeasonIds.has(g.season_id)) return false;
        const ev = Array.isArray(g.event) ? g.event[0] : g.event;
        if (ev && (ev as { game_type?: string }).game_type === "friendly") return false;
        return true;
      });

      const wins   = games.filter((g) => g.home_score > g.away_score).length;
      const losses = games.filter((g) => g.home_score < g.away_score).length;

      const lastGame = games[0] ?? null;
      let lastActivityLabel = "Sem resultados recentes";
      let lastActivityAt    = new Date().toISOString();

      if (lastGame) {
        lastActivityAt = lastGame.created_at;
        const won   = lastGame.home_score > lastGame.away_score;
        const score = `${lastGame.home_score}-${lastGame.away_score}`;
        const loc   = lastGame.is_home_game ? "em casa" : "fora";
        const ago   = relativeTime(lastGame.created_at);
        lastActivityLabel = `${won ? "Venceu" : "Perdeu"} ${loc} ${score} ${ago}`;
      }

      // Liga: campo não existe em club_settings — usa a liga pública ativa, se houver
      const league = activeLeagues[0]?.name ?? "Liga Regional";
      leagueSet.add(league);

      return {
        id:                 club.id,
        name:               club.club_name ?? "Clube",
        logo_url:           club.logo_url ?? null,
        slug:               (club as { slug?: string | null }).slug ?? null,
        league,
        position:           null,   // não há dados de classificação na BD ainda
        wins,
        losses,
        lastActivityLabel,
        lastActivityAt,
      };
    });

    // Ordena por atividade mais recente
    activeClubs.sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return NextResponse.json(
      {
        clubCount,
        leagueCount: activeLeagues.length || leagueSet.size,
        activeClubs,
        activeLeagues,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=600, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    // Falha silenciosa — landing não quebra se API falhar
    return NextResponse.json(
      { clubCount: 0, leagueCount: 0, activeClubs: [], activeLeagues: [] },
      { status: 200 }
    );
  }
}
