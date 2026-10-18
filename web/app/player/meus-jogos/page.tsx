import { todayInClubTz } from "@/lib/time/club-time";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

export const metadata = { title: "Os Meus Jogos" };

export default async function MeusJogosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayInClubTz();

  // Buscar todos os jogos: próximos (ASC) + passados (DESC), depois unir mantendo essa ordem
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase.from("events").select("id, title, event_date, event_time, location, opponent, type")
      .eq("type", "jogo").gte("event_date", today).order("event_date", { ascending: true }).limit(20),
    supabase.from("events").select("id, title, event_date, event_time, location, opponent, type")
      .eq("type", "jogo").lt("event_date", today).order("event_date", { ascending: false }).limit(30),
  ]);

  type Game = { id: string; title: string; event_date: string; event_time?: string; location?: string; opponent?: string };
  type CalledUpPlayer = { id: string; game_id: string; name: string; number: number | null };
  type GameResult = { home_score: number; away_score: number; status: string };

  const upcomingList = (upcoming ?? []) as Game[];
  const pastList     = (past     ?? []) as Game[];
  const allGames     = [...upcomingList, ...pastList];

  // Buscar resultados (game_sessions finished) para jogos passados
  const pastGameIds = pastList.map((g) => g.id);
  const { data: sessionRows } = pastGameIds.length > 0
    ? await supabase.from("game_sessions")
        .select("event_id, home_score, away_score, status")
        .in("event_id", pastGameIds)
        .eq("status", "finished")
    : { data: [] };
  const sessionByGame = new Map<string, GameResult>(
    (sessionRows ?? []).map((s) => [
      s.event_id as string,
      { home_score: s.home_score as number, away_score: s.away_score as number, status: s.status as string },
    ])
  );

  // players.name foi removido na migration 041 — enriquecer via v_roster
  const gameIds = allGames.map((g) => g.id);
  const { data: callupRows } = gameIds.length
    ? await supabase.from("game_callups").select("game_id, player_id").in("game_id", gameIds)
    : { data: [] as { game_id: string; player_id: string }[] };

  const callupPlayerIds = [...new Set((callupRows ?? []).map((r) => r.player_id as string))];
  const { data: rosterRows } = callupPlayerIds.length > 0
    ? await supabase.from("v_roster").select("player_id, name, number").in("player_id", callupPlayerIds)
    : { data: [] };
  const rosterById = new Map((rosterRows ?? []).map((r) => [r.player_id as string, r]));

  const callupsByGame = new Map<string, CalledUpPlayer[]>();
  for (const row of (callupRows ?? []) as { game_id: string; player_id: string }[]) {
    const r = rosterById.get(row.player_id);
    if (!r) continue;
    const list = callupsByGame.get(row.game_id) ?? [];
    list.push({ id: r.player_id as string, game_id: row.game_id, name: r.name as string, number: r.number as number | null });
    callupsByGame.set(row.game_id, list);
  }

  function GameCard({ game }: { game: Game }) {
    const callups = callupsByGame.get(game.id) ?? [];
    const isPast  = game.event_date < today;
    const result  = isPast ? sessionByGame.get(game.id) : undefined;
    const won     = result ? result.home_score > result.away_score : null;
    const lost    = result ? result.home_score < result.away_score : null;
    return (
      <Card className={isPast && !result ? "opacity-70" : ""}>
        <CardContent className="flex items-start gap-4 p-4">
          {/* Icon / Score block */}
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            {result ? (
              <div
                className="flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[64px]"
                style={{
                  background: won ? "#dcfce7" : lost ? "#fee2e2" : "#f3f4f6",
                  border: `1.5px solid ${won ? "#86efac" : lost ? "#fca5a5" : "#e5e7eb"}`,
                }}
              >
                <span
                  className="text-xl font-black tabular-nums leading-none"
                  style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#374151" }}
                >
                  {result.home_score}–{result.away_score}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
                  style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#6b7280" }}
                >
                  {won ? "Vitória" : lost ? "Derrota" : "Empate"}
                </span>
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: "var(--club-bg, #eeeeee)", color: "var(--club-primary, #111111)" }}>
                {isPast ? <Trophy className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold truncate">{game.title}</p>
              {game.opponent && (
                <Badge variant="outline" className="text-[11px]">
                  {game.title.includes("(Fora)") ? "@" : "vs"} {game.opponent}
                </Badge>
              )}
              {isPast && !result && <Badge variant="secondary" className="text-[11px]">Terminado</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(game.event_date).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </span>
              {game.event_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{game.event_time.slice(0, 5)}h</span>}
              {game.location  && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{game.location}</span>}
            </div>
            <div className="mt-2 border-t pt-2">
              <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Users className="h-3 w-3" /> Convocados
              </p>
              {callups.length === 0
                ? <p className="mt-1 text-xs text-muted-foreground">
                    {isPast ? "Convocatória não registada." : "Convocatória ainda não definida."}
                  </p>
                : <div className="mt-1 flex flex-wrap gap-1.5">
                    {callups.map((c) => (
                      <Badge key={c.id} variant="secondary" className="text-[11px]">
                        {c.number != null ? `#${c.number} ` : ""}{c.name}
                      </Badge>
                    ))}
                  </div>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Os Meus Jogos</h1>
        <p className="text-muted-foreground">Calendário de jogos da equipa.</p>
      </div>

      {upcomingList.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Próximos Jogos</h2>
          <div className="space-y-2">{upcomingList.map((g) => <GameCard key={g.id} game={g} />)}</div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-muted-foreground">
          {upcomingList.length === 0 ? "Jogos" : "Jogos Anteriores"}
        </h2>
        {pastList.length === 0
          ? <p className="text-sm text-muted-foreground">Sem jogos registados.</p>
          : <div className="space-y-2">{pastList.map((g) => <GameCard key={g.id} game={g} />)}</div>}
      </div>
    </div>
  );
}
