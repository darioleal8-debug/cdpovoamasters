"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar, Clock, MapPin, Shield, Trophy, ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvailabilityPrompt } from "@/components/player/availability-prompt";
import { lisbonDateTime } from "@/lib/event-time";
import { cn, buildMapsUrl } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────

export type ProcessedGame = {
  id: string;
  title: string;
  event_date: string;
  event_time: string;
  location: string;
  is_club_game: boolean;
  jornada: number | null;
  volta: number;
  syntheticJornada: number | null;
  home_team: string | null;
  away_team: string | null;
  pavilion: string | null;
  locality: string | null;
  result: { home: number; away: number } | null;
  isCalledUp: boolean;
  myAvailability: "yes" | "no" | null;
  isPast: boolean;
};

type JornadaGroup = {
  syntheticJornada: number;
  jornada: number;
  volta: number;
  games: ProcessedGame[];
  ourGame: ProcessedGame | null;
};

// ─── Helpers ──────────────────────────────────────────────

function jornadaLabel(jornada: number, volta: number): string {
  return `Jornada ${jornada}${volta > 1 ? ` · ${volta}ª Volta` : ""}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-PT", {
      weekday: "short", day: "numeric", month: "short",
    });
  } catch { return iso; }
}

function fmtTime(t: string | null | undefined): string {
  return t?.slice(0, 5) ?? "";
}

function buildGroups(games: ProcessedGame[]): JornadaGroup[] {
  const map = new Map<number, ProcessedGame[]>();
  for (const g of games) {
    const syn = g.syntheticJornada;
    if (syn == null) continue;
    if (!map.has(syn)) map.set(syn, []);
    map.get(syn)!.push(g);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([syn, gms]) => ({
      syntheticJornada: syn,
      jornada: gms[0]?.jornada ?? syn,
      volta: gms[0]?.volta ?? 1,
      games: gms,
      ourGame: gms.find((g) => g.is_club_game) ?? null,
    }));
}

// ─── Cartão de jogo ───────────────────────────────────────

function GameCard({
  game,
  isNext,
  playerId,
  compact = false,
}: {
  game: ProcessedGame;
  isNext?: boolean;
  playerId: string | null;
  compact?: boolean;
}) {
  const { result } = game;
  const won  = result ? result.home > result.away : null;
  const lost = result ? result.home < result.away : null;
  const mapsUrl = buildMapsUrl(game.pavilion, game.locality);

  return (
    <div className={cn(
      "rounded-xl border transition-colors",
      isNext
        ? "border-cdpovoa-primary/40 bg-cdpovoa-primary/5 shadow-sm"
        : game.isPast
          ? "border-border bg-muted/10 opacity-80"
          : "border-blue-200/60 bg-blue-50/30 dark:border-blue-800/40 dark:bg-blue-950/10",
      game.is_club_game && !compact ? "p-4" : "px-3 py-2.5"
    )}>
      {/* Linha superior: equipas + resultado */}
      <div className="flex items-center gap-2">
        {/* Resultado / ícone */}
        {result ? (
          <div
            className="shrink-0 flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 min-w-[52px]"
            style={{
              background: won ? "#dcfce7" : lost ? "#fee2e2" : "#f3f4f6",
              border: `1.5px solid ${won ? "#86efac" : lost ? "#fca5a5" : "#e5e7eb"}`,
            }}
          >
            <span className="text-base font-black tabular-nums leading-none"
              style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#374151" }}>
              {result.home}–{result.away}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5"
              style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#6b7280" }}>
              {won ? "Vitória" : lost ? "Derrota" : "Empate"}
            </span>
          </div>
        ) : (
          <div className={cn(
            "shrink-0 flex items-center justify-center rounded-lg",
            compact ? "h-8 w-8" : "h-9 w-9"
          )}
            style={{ backgroundColor: "var(--club-bg,#eee)", color: "var(--club-primary,#111)" }}>
            {game.isPast ? <Trophy className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
          </div>
        )}

        {/* Equipas */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              "text-sm font-semibold truncate",
              game.is_club_game && !game.isPast ? "text-cdpovoa-primary" : ""
            )}>
              {game.home_team ?? game.title}
            </span>
            {game.away_team && (
              <>
                <span className="text-xs text-muted-foreground shrink-0">vs</span>
                <span className={cn(
                  "text-sm font-semibold truncate",
                  game.is_club_game && !game.isPast ? "text-cdpovoa-primary" : ""
                )}>
                  {game.away_team}
                </span>
              </>
            )}
          </div>
          {/* Data/hora/local */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />{fmtDate(game.event_date)}
            </span>
            {game.event_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />{fmtTime(game.event_time)}h
              </span>
            )}
            {game.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {game.pavilion || game.locality
                  ? [game.pavilion, game.locality].filter(Boolean).join(", ")
                  : game.location}
              </span>
            )}
            {mapsUrl && !compact && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-orange-500 hover:text-orange-600">
                <MapPin className="h-3 w-3" />Mapa
              </a>
            )}
          </div>
        </div>

        {/* Badges direita */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {isNext && (
            <Badge className="bg-cdpovoa-primary text-white text-[10px]">Próximo</Badge>
          )}
          {game.is_club_game && (
            <Badge
              variant={game.home_team && game.is_club_game ? "default" : "outline"}
              className={cn("text-[10px]", "bg-cdpovoa-primary hover:bg-cdpovoa-primary/90")}
            >
              <Shield className="h-2.5 w-2.5 mr-1" />
              {/* Determinar Casa/Fora via is_home stored in title or via team name — use title heuristic */}
              {game.title.includes("(Fora)") ? "Fora" : "Casa"}
            </Badge>
          )}
        </div>
      </div>

      {/* Disponibilidade — só para jogos do clube, futuros, com playerId */}
      {game.is_club_game && !game.isPast && playerId && (
        <div className="mt-3 pt-3 border-t">
          <AvailabilityPrompt
            kind="game"
            eventId={game.id}
            deadlineIso={lisbonDateTime(game.event_date, game.event_time).toISOString()}
            initialAnswer={game.myAvailability}
          />
        </div>
      )}
    </div>
  );
}

// ─── Secção de Jornada colapsável ─────────────────────────

function JornadaSection({
  group,
  isOpen,
  onToggle,
  showAll,
  playerId,
  nextGameId,
}: {
  group: JornadaGroup;
  isOpen: boolean;
  onToggle: () => void;
  showAll: boolean;     // true = liga view, false = agenda view
  playerId: string | null;
  nextGameId: string | null;
}) {
  const { jornada, volta, games, ourGame } = group;
  const isFolga = !ourGame;
  const hasResult = ourGame?.result != null;
  const isPastJornada = (ourGame ?? games[0])?.isPast ?? false;

  const badgeColor = isFolga
    ? "border-muted-foreground/30 text-muted-foreground"
    : hasResult
      ? "border-border text-muted-foreground"
      : "border-cdpovoa-primary/60 text-cdpovoa-primary";

  return (
    <div>
      {/* Cabeçalho da jornada */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2 px-1 rounded-lg hover:bg-muted/40 transition-colors text-left"
      >
        <div className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isFolga ? "bg-muted text-muted-foreground" : "bg-cdpovoa-primary text-white"
        )}>
          {jornada}
        </div>
        <span className="flex-1 text-sm font-semibold">{jornadaLabel(jornada, volta)}</span>
        {!showAll && (
          <Badge variant="outline" className={cn("text-[10px] shrink-0", badgeColor)}>
            {isFolga ? "Folga" : hasResult ? "Terminado" : "Agendado"}
          </Badge>
        )}
        {showAll && (
          <span className="text-xs text-muted-foreground shrink-0">{games.length} jogo{games.length !== 1 ? "s" : ""}</span>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
      </button>

      {/* Conteúdo */}
      {isOpen && (
        <div className="mt-1 mb-3 space-y-2 pl-1">
          {showAll ? (
            // Liga: todos os jogos
            games.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                isNext={g.id === nextGameId}
                playerId={playerId}
                compact={!g.is_club_game}
              />
            ))
          ) : (
            // Agenda: só o jogo do clube ou Folga
            isFolga ? (
              <div className={cn(
                "flex items-center gap-3 rounded-lg border border-dashed px-4 py-3",
                isPastJornada && "opacity-50"
              )}>
                <span className="text-sm text-muted-foreground flex-1">
                  {jornadaLabel(jornada, volta)} — sem jogo agendado
                </span>
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30 shrink-0">
                  Folga
                </Badge>
              </div>
            ) : (
              <GameCard
                key={ourGame!.id}
                game={ourGame!}
                isNext={ourGame!.id === nextGameId}
                playerId={playerId}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────

export function MeusJogosView({
  games,
  initialVista,
  playerId,
  today,
}: {
  games: ProcessedGame[];
  initialVista: "liga" | "agenda";
  playerId: string | null;
  today: string;
}) {
  const [vista, setVista] = useState<"liga" | "agenda">(initialVista);

  // URL persistence
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("vista", vista);
    window.history.replaceState({}, "", url.toString());
  }, [vista]);

  const allGroups = buildGroups(games);

  // Próximo jogo do clube
  const nextGame = games
    .filter((g) => g.is_club_game && !g.isPast)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))[0] ?? null;
  const nextGameId = nextGame?.id ?? null;

  // Jornada do próximo jogo (para abrir por defeito)
  const nextSyn = nextGame?.syntheticJornada ?? null;

  // Estado de abertura de cada jornada
  const [openSections, setOpenSections] = useState<Set<number>>(() => {
    const s = new Set<number>();
    if (nextSyn != null) s.add(nextSyn);
    // Também abre a última jornada passada
    const lastPast = [...allGroups].reverse().find((g) => {
      const firstDate = (g.ourGame ?? g.games[0])?.event_date;
      return firstDate != null && firstDate < today;
    });
    if (lastPast) s.add(lastPast.syntheticJornada);
    return s;
  });

  const toggle = useCallback((syn: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(syn)) next.delete(syn); else next.add(syn);
      return next;
    });
  }, []);

  const isEmpty = allGroups.length === 0;

  return (
    <div className="space-y-4">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Os Meus Jogos</h1>
        <p className="text-muted-foreground text-sm">Calendário de jogos da equipa.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {(["agenda", "liga"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
              vista === v
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v === "agenda" ? "Minha Agenda" : "Calendário da Liga"}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {isEmpty ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <Trophy className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="font-medium">Calendário ainda não importado</p>
        </div>
      ) : (
        <div className="divide-y">
          {allGroups.map((group) => (
            <JornadaSection
              key={group.syntheticJornada}
              group={group}
              isOpen={openSections.has(group.syntheticJornada)}
              onToggle={() => toggle(group.syntheticJornada)}
              showAll={vista === "liga"}
              playerId={playerId}
              nextGameId={nextGameId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
