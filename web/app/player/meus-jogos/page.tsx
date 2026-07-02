import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Os Meus Jogos" };

export default async function MeusJogosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);

  // Buscar todos os jogos: próximos (ASC) + passados (DESC), depois unir mantendo essa ordem
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase.from("events").select("id, title, event_date, event_time, location, opponent, type")
      .eq("type", "jogo").gte("event_date", today).order("event_date", { ascending: true }).limit(20),
    supabase.from("events").select("id, title, event_date, event_time, location, opponent, type")
      .eq("type", "jogo").lt("event_date", today).order("event_date", { ascending: false }).limit(30),
  ]);

  type Game = { id: string; title: string; event_date: string; event_time?: string; location?: string; opponent?: string };
  type CalledUpPlayer = { id: string; game_id: string; name: string; number: number | null };

  const upcomingList = (upcoming ?? []) as Game[];
  const pastList     = (past     ?? []) as Game[];
  const allGames     = [...upcomingList, ...pastList];

  const gameIds = allGames.map((g) => g.id);
  const { data: callupRows } = gameIds.length
    ? await supabase.from("game_callups").select("game_id, player:players(id, name, number)")
        .in("game_id", gameIds)
    : { data: [] as { game_id: string; player: { id: string; name: string; number: number | null } | null }[] };

  const callupsByGame = new Map<string, CalledUpPlayer[]>();
  for (const row of (callupRows ?? []) as { game_id: string; player: { id: string; name: string; number: number | null } | null }[]) {
    if (!row.player) continue;
    const list = callupsByGame.get(row.game_id) ?? [];
    list.push({ id: row.player.id, game_id: row.game_id, name: row.player.name, number: row.player.number });
    callupsByGame.set(row.game_id, list);
  }

  function GameCard({ game }: { game: Game }) {
    const callups = callupsByGame.get(game.id) ?? [];
    const isPast  = game.event_date < today;
    return (
      <Card className={isPast ? "opacity-70" : ""}>
        <CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--club-bg, #eeeeee)", color: "var(--club-primary, #111111)" }}>
            <Calendar className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold truncate">{game.title}</p>
              {game.opponent && (
                <Badge variant="outline" className="text-[10px]">
                  {game.title.includes("(Fora)") ? "@" : "vs"} {game.opponent}
                </Badge>
              )}
              {isPast && <Badge variant="secondary" className="text-[10px]">Terminado</Badge>}
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
                      <Badge key={c.id} variant="secondary" className="text-[10px]">
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
