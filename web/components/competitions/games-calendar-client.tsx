"use client";

import { useState, useMemo } from "react";
import type { PublicGame } from "@/types/competitions";
import { GameCard } from "./game-card";
import { cn } from "@/lib/utils";

interface Props {
  games: PublicGame[];
  ourTeamName: string;
  competitionSlug: string;
  mode?: "calendar" | "results"; // calendar = future first; results = past with results first
}

type Filter = "all" | "our_games" | "with_result" | "no_result";

export function GamesCalendarClient({ games, ourTeamName, competitionSlug, mode = "calendar" }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedJornada, setSelectedJornada] = useState<number | "all">("all");

  const jornadas = useMemo(() => {
    const set = new Set<number>();
    for (const g of games) if (g.syntheticJornada) set.add(g.syntheticJornada);
    return Array.from(set).sort((a, b) => a - b);
  }, [games]);

  const filtered = useMemo(() => {
    let result = [...games];

    if (mode === "results") {
      result = result.filter((g) => g.result_status === "approved" || g.result_status === "pending");
      result.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
    } else {
      result.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
    }

    if (filter === "our_games") result = result.filter((g) => g.is_our_game);
    if (filter === "with_result") result = result.filter((g) => g.result_status === "approved");
    if (filter === "no_result") result = result.filter((g) => g.result_status === "no_result");
    if (selectedJornada !== "all") result = result.filter((g) => g.syntheticJornada === selectedJornada);

    return result;
  }, [games, filter, selectedJornada, mode]);

  // Group by syntheticJornada (or by date for results mode)
  const grouped = useMemo(() => {
    const map = new Map<number, PublicGame[]>();
    for (const g of filtered) {
      const key = g.syntheticJornada || 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    const entries = Array.from(map.entries()).sort((a, b) =>
      mode === "results" ? b[0] - a[0] : a[0] - b[0]
    );
    return entries;
  }, [filtered, mode]);

  const FILTER_LABELS: Record<Filter, string> = {
    all: "Todos",
    our_games: `CD Póvoa`,
    with_result: "Com resultado",
    no_result: "Sem resultado",
  };

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap mb-4">
        {(["all", "our_games", "with_result", "no_result"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              filter === f
                ? "bg-orange-500 text-white border-orange-500"
                : "border-border text-muted-foreground hover:border-orange-400 hover:text-foreground"
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Jornada selector */}
      {jornadas.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-6">
          <button
            onClick={() => setSelectedJornada("all")}
            className={cn(
              "px-2 py-0.5 rounded text-xs border transition-colors",
              selectedJornada === "all"
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:border-foreground"
            )}
          >
            Todas
          </button>
          {jornadas.map((j) => (
            <button
              key={j}
              onClick={() => setSelectedJornada(j)}
              className={cn(
                "px-2 py-0.5 rounded text-xs border transition-colors tabular-nums",
                selectedJornada === j
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground"
              )}
            >
              J{j}
            </button>
          ))}
        </div>
      )}

      {grouped.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          Nenhum jogo encontrado com os filtros selecionados.
        </p>
      ) : (
        <div className="space-y-8">
          {grouped.map(([jornada, gamesInJornada]) => (
            <section key={jornada}>
              {jornada > 0 && (
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Jornada {jornada}
                </h3>
              )}
              <div className="space-y-2">
                {gamesInJornada.map((g) => (
                  <GameCard key={g.id} game={g} competitionSlug={competitionSlug} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
