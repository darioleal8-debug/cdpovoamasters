"use client";

import { useMemo, useState } from "react";
import { Calendar, Clock, MapPin, Shield, Trophy, Map as MapIcon, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, buildMapsUrl } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import type { LeagueGame } from "@/hooks/use-league-calendar";
import type { Event } from "@/types/database";

// ─── Tipos ────────────────────────────────────────────────

interface Props {
  allJornadas: number[];
  jornadaMeta: Record<number, { jornada: number; volta: number }>;
  rawGames: LeagueGame[];   // todos os jogos da liga (para datas das Folgas)
  events: Event[];          // eventos do clube (treinos, outros)
  loading: boolean;
}

type AgendaItem =
  | { kind: "game";   date: string;        syntheticJornada: number; jornada: number; volta: number; game: LeagueGame }
  | { kind: "folga";  date: string | null; syntheticJornada: number; jornada: number; volta: number }
  | { kind: "event";  date: string;        event: Event };

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), "EEE, d MMM", { locale: pt }); }
  catch { return iso; }
}

function fmtTime(t: string | null | undefined): string {
  return t?.slice(0, 5) ?? "";
}

function jornadaLabel(jornada: number, volta: number): string {
  return `Jornada ${jornada}${volta > 1 ? ` · ${volta}ª Volta` : ""}`;
}

// ─── Cards individuais ────────────────────────────────────

function FolgaCard({ item, isPast }: { item: Extract<AgendaItem, { kind: "folga" }>; isPast: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border border-dashed px-4 py-2.5",
      isPast && "opacity-50"
    )}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
        {item.jornada}
      </div>
      <span className="flex-1 text-sm text-muted-foreground">
        {jornadaLabel(item.jornada, item.volta)}
      </span>
      <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/30 shrink-0">
        Folga
      </Badge>
      {item.date && (
        <span className="text-xs text-muted-foreground shrink-0">{fmtDate(item.date)}</span>
      )}
    </div>
  );
}

function EventCard({ item, isPast }: { item: Extract<AgendaItem, { kind: "event" }>; isPast: boolean }) {
  const ev = item.event;
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-2.5",
      isPast && "opacity-60"
    )}>
      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-1 min-w-0 items-center gap-2">
        <span className="text-sm font-medium truncate">{ev.title}</span>
        {ev.type === "treino" && (
          <Badge variant="secondary" className="text-[10px] shrink-0">Treino</Badge>
        )}
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <div>{fmtDate(ev.event_date)}</div>
        {ev.event_time && <div>{fmtTime(ev.event_time)}h</div>}
      </div>
    </div>
  );
}

function GameCard({
  item, isNext, isPast,
}: {
  item: Extract<AgendaItem, { kind: "game" }>;
  isNext: boolean;
  isPast: boolean;
}) {
  const { game, jornada, volta } = item;

  return (
    <div className={cn(
      "rounded-xl border px-4 py-3 transition-colors",
      isNext
        ? "border-cdpovoa-primary/40 bg-cdpovoa-primary/5 shadow-sm"
        : isPast
          ? "border-border bg-muted/10 opacity-75"
          : "border-blue-200/60 bg-blue-50/40 dark:border-blue-800/40 dark:bg-blue-950/10"
    )}>
      {/* Cabeçalho da linha */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isNext ? "bg-cdpovoa-primary text-white" : "bg-muted text-muted-foreground"
        )}>
          {jornada}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {jornadaLabel(jornada, volta)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isNext && (
            <Badge className="bg-cdpovoa-primary text-white text-[10px]">Próximo jogo</Badge>
          )}
          <Badge
            variant={game.is_home ? "default" : "outline"}
            className={cn(
              "text-[10px]",
              game.is_home
                ? "bg-cdpovoa-primary hover:bg-cdpovoa-primary/90"
                : "border-cdpovoa-primary/50 text-cdpovoa-primary"
            )}
          >
            <Shield className="h-2.5 w-2.5 mr-1" />
            {game.is_home ? "Casa" : "Fora"}
          </Badge>
        </div>
      </div>

      {/* Equipas */}
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("flex-1 truncate", game.is_home && "text-cdpovoa-primary")}>
          {game.home_team}
        </span>
        <span className="text-muted-foreground text-xs font-normal shrink-0">vs</span>
        <span className={cn("flex-1 truncate text-right", !game.is_home && "text-cdpovoa-primary")}>
          {game.away_team}
        </span>
      </div>

      {/* Data / hora / local */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {game.event_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {fmtDate(game.event_date)}
          </span>
        )}
        {game.event_time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {fmtTime(game.event_time)}h
          </span>
        )}
        {(game.pavilion || game.locality) && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {[game.pavilion, game.locality].filter(Boolean).join(", ")}
          </span>
        )}
        {buildMapsUrl(game.pavilion, game.locality) && (
          <a
            href={buildMapsUrl(game.pavilion, game.locality)!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-orange-500 hover:text-orange-600"
          >
            <MapIcon className="h-3 w-3" />
            Mapa
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────

export function LeagueAgenda({ allJornadas, jornadaMeta, rawGames, events, loading }: Props) {
  const [showPast, setShowPast] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  // Indexar o jogo do clube por jornada
  const ourGamesByJornada = useMemo(() => {
    const map = new Map<number, LeagueGame>();
    for (const g of rawGames) {
      if (g.is_our_game) map.set(g.syntheticJornada, g);
    }
    return map;
  }, [rawGames]);

  // Primeira data de cada jornada (para Folgas sem jogo do clube)
  const firstDateByJornada = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of rawGames) {
      if (!map.has(g.syntheticJornada)) map.set(g.syntheticJornada, g.event_date);
    }
    return map;
  }, [rawGames]);

  // Treinos e outros eventos (não jogos da liga)
  const clubEvents = useMemo(
    () => events.filter((e) => e.type !== "jogo"),
    [events]
  );

  // Construir lista combinada e ordenada por data
  const items = useMemo((): AgendaItem[] => {
    const result: AgendaItem[] = [];

    for (const syn of allJornadas) {
      const meta = jornadaMeta[syn];
      if (!meta) continue;
      const ourGame = ourGamesByJornada.get(syn) ?? null;
      const date = ourGame?.event_date ?? firstDateByJornada.get(syn) ?? null;

      if (ourGame) {
        result.push({ kind: "game", date: ourGame.event_date, syntheticJornada: syn, jornada: meta.jornada, volta: meta.volta, game: ourGame });
      } else {
        result.push({ kind: "folga", date, syntheticJornada: syn, jornada: meta.jornada, volta: meta.volta });
      }
    }

    for (const e of clubEvents) {
      result.push({ kind: "event", date: e.event_date, event: e });
    }

    // Ordenar por data (null → fundo)
    result.sort((a, b) => {
      const da = a.date ?? "9999-99-99";
      const db = b.date ?? "9999-99-99";
      return da.localeCompare(db);
    });

    return result;
  }, [allJornadas, jornadaMeta, ourGamesByJornada, firstDateByJornada, clubEvents]);

  const pastItems     = useMemo(() => items.filter((i) => i.date && i.date <  today), [items, today]);
  const upcomingItems = useMemo(() => items.filter((i) => !i.date || i.date >= today), [items, today]);

  // Próximo jogo do clube
  const nextGame = useMemo(() => {
    for (const item of upcomingItems) {
      if (item.kind === "game") return item.game;
    }
    return null;
  }, [upcomingItems]);

  const pastGamesCount = pastItems.filter((i) => i.kind === "game").length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (allJornadas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
        <Trophy className="mx-auto h-10 w-10 mb-3 opacity-30" />
        <p className="font-medium">Calendário ainda não importado</p>
        <p className="text-sm mt-1">
          Vai a <strong>Configurações → Importar Calendário</strong> para importar o ficheiro Excel INATEL.
        </p>
      </div>
    );
  }

  function renderItem(item: AgendaItem, isPast: boolean) {
    const key = item.kind === "event" ? `ev-${item.event.id}` : `j-${item.syntheticJornada}`;
    if (item.kind === "folga") return <FolgaCard key={key} item={item} isPast={isPast} />;
    if (item.kind === "event") return <EventCard key={key} item={item} isPast={isPast} />;
    return (
      <GameCard
        key={key}
        item={item}
        isNext={item.game === nextGame}
        isPast={isPast}
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* Jogos passados (recolhidos por defeito) */}
      {pastGamesCount > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPast((p) => !p)}
            className="gap-1.5 text-muted-foreground w-full justify-start mb-1"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showPast && "rotate-180")} />
            {showPast
              ? "Ocultar jogos anteriores"
              : `Ver jogos anteriores (${pastGamesCount})`}
          </Button>
          {showPast && (
            <div className="space-y-2 mb-3">
              {pastItems.map((item) => renderItem(item, true))}
            </div>
          )}
        </div>
      )}

      {/* Itens futuros */}
      <div className="space-y-2">
        {upcomingItems.map((item) => renderItem(item, false))}
      </div>

      {upcomingItems.length === 0 && (
        <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <p className="text-sm">Não há mais jogos nesta temporada.</p>
        </div>
      )}
    </div>
  );
}
