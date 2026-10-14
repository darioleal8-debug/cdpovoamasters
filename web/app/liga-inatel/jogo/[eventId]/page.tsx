import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getOurTeamName } from "@/lib/competitions-data";
import { parseGameMeta } from "@/types/competitions";

export const revalidate = 60;

async function getGameData(eventId: string) {
  const supabase = await createAdminClient();

  const [eventRes, resultRes, sessionRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, event_date, event_time, location, description, opponent")
      .eq("id", eventId)
      .eq("type", "jogo")
      .single(),
    supabase
      .from("league_game_results")
      .select("*")
      .eq("event_id", eventId)
      .single(),
    supabase
      .from("game_sessions")
      .select("id, status, home_score, away_score, is_home_game")
      .eq("event_id", eventId)
      .single(),
  ]);

  return {
    event:   eventRes.data,
    result:  resultRes.data,
    session: sessionRes.data,
  };
}

const MONTH = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const WEEKDAY = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const { event } = await getGameData(eventId);
  const meta = parseGameMeta(event?.description ?? null);
  const home = meta?.home_team ?? "CD Póvoa Masters";
  const away = meta?.away_team ?? "Adversário";
  return {
    title: `${home} vs ${away}`,
    description: `Detalhe do jogo ${home} vs ${away} — Liga INATEL.`,
  };
}

export default async function GameDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [{ event, result, session }, ourTeam] = await Promise.all([
    getGameData(eventId),
    getOurTeamName(),
  ]);

  if (!event) notFound();

  const meta = parseGameMeta(event.description ?? null);
  const homeTeam = meta?.home_team ?? ourTeam;
  const awayTeam = meta?.away_team ?? (event.opponent ?? "Adversário");
  const d = new Date(event.event_date + "T12:00:00");
  const dateLabel = `${WEEKDAY[d.getDay()]}, ${d.getDate()} de ${MONTH[d.getMonth()]} de ${d.getFullYear()}`;

  const isLive = session?.status === "live";
  const hasResult = !!result;

  const homeWon = hasResult && result!.home_score > result!.away_score;
  const awayWon = hasResult && result!.away_score > result!.home_score;
  const isOurHome = homeTeam === ourTeam || homeTeam.toLowerCase().includes("póvoa");
  const weWon = hasResult && ((isOurHome && homeWon) || (!isOurHome && awayWon));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/liga-inatel/resultados" className="text-xs text-muted-foreground hover:text-foreground">
          ← Resultados
        </Link>
      </div>

      {/* Game header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        {meta?.jornada && (
          <p className="text-xs text-muted-foreground text-center mb-1 uppercase tracking-wider">
            Jornada {meta.jornada}{meta.volta ? ` · Volta ${meta.volta}` : ""}
          </p>
        )}

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <h2 className={`text-lg font-bold text-right flex-1 ${isOurHome ? "text-orange-600 dark:text-orange-400" : ""}`}>
            {homeTeam}
          </h2>

          <div className="text-center shrink-0">
            {isLive ? (
              <div className="space-y-1">
                <div className="text-4xl font-bold tabular-nums">
                  {session!.home_score ?? 0}
                  <span className="text-muted-foreground mx-2">–</span>
                  {session!.away_score ?? 0}
                </div>
                <span className="inline-flex items-center gap-1 text-orange-500 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  AO VIVO
                </span>
              </div>
            ) : hasResult ? (
              <div className="space-y-1">
                <div className="text-5xl font-bold tabular-nums">
                  <span className={homeWon ? "" : "text-muted-foreground"}>{result!.home_score}</span>
                  <span className="text-muted-foreground mx-2 text-3xl">–</span>
                  <span className={awayWon ? "" : "text-muted-foreground"}>{result!.away_score}</span>
                </div>
                {weWon !== undefined && (
                  <p className={`text-sm font-semibold ${weWon ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    {weWon ? "Vitória" : "Derrota"}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-2xl font-light">vs</div>
            )}
          </div>

          <h2 className={`text-lg font-bold text-left flex-1 ${!isOurHome ? "text-orange-600 dark:text-orange-400" : ""}`}>
            {awayTeam}
          </h2>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data & Local</h3>
          <p className="capitalize">{dateLabel}{event.event_time ? ` · ${event.event_time.slice(0, 5)}` : ""}</p>
          {event.location && <p className="text-muted-foreground">{event.location}</p>}
          {meta?.pavilion && <p className="text-muted-foreground">{meta.pavilion}</p>}
          {meta?.locality && <p className="text-muted-foreground">{meta.locality}</p>}
        </div>

        {isLive && session?.id && (
          <div className="rounded-xl border border-orange-400 bg-orange-500/5 p-4 flex flex-col justify-between">
            <h3 className="text-xs font-semibold text-orange-500 uppercase tracking-wider mb-2">Ao Vivo</h3>
            <Link
              href={`/live/${session.id}`}
              className="block w-full text-center py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-colors"
            >
              Ver jogo ao vivo →
            </Link>
          </div>
        )}
      </div>

      {/* Submit result CTA if no result */}
      {!hasResult && !isLive && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
          <p className="text-muted-foreground text-sm">Resultado ainda não registado</p>
          <Link
            href={`/liga-inatel/resultados/submeter?jogo=${event.id}`}
            className="inline-block px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
          >
            Submeter resultado
          </Link>
        </div>
      )}
    </div>
  );
}
