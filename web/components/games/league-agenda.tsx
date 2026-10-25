"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar, Clock, MapPin, Shield, Trophy, Map as MapIcon,
  ChevronDown, Users, BarChart2, Dumbbell, Swords,
} from "lucide-react";
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
  rawGames: LeagueGame[];
  events: Event[];
  loading: boolean;
  isPlayer?: boolean;
}

type AgendaItem =
  | { kind: "game";       date: string;        syntheticJornada: number; jornada: number; volta: number; game: LeagueGame }
  | { kind: "extra_game"; date: string;        event: Event }
  | { kind: "folga";      date: string | null; syntheticJornada: number; jornada: number; volta: number }
  | { kind: "event";      date: string;        event: Event };

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

// Parse meta from description JSON for extra games
function parseExtraMeta(event: Event) {
  if (!event.description) return null;
  try {
    const m = JSON.parse(event.description) as {
      jornada?: number; volta?: number; home_team?: string; away_team?: string;
      pavilion?: string; locality?: string; is_home?: boolean;
    };
    return m;
  } catch { return null; }
}

// ─── Botões de acção ──────────────────────────────────────

function ActionButtons({ eventId, stopClick }: { eventId: string; stopClick: (e: React.MouseEvent) => void }) {
  return (
    <div className="mt-2 flex items-center gap-1" onClick={stopClick}>
      <Link href={`/jogos/${eventId}/convocatoria`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-cdpovoa-primary hover:bg-cdpovoa-primary/10"
        >
          <Users className="h-3 w-3" />
          Convocados
        </Button>
      </Link>
      <Link href={`/jogos/${eventId}/stats`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <BarChart2 className="h-3 w-3" />
          Stats
        </Button>
      </Link>
    </div>
  );
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
  const router = useRouter();
  const { game, jornada, volta } = item;

  function stopClick(e: React.MouseEvent) { e.stopPropagation(); }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/jogos/${game.id}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/jogos/${game.id}`)}
      className={cn(
        "rounded-xl border px-4 py-3 cursor-pointer transition-colors hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdpovoa-primary",
        isNext
          ? "border-cdpovoa-primary/40 bg-cdpovoa-primary/5 shadow-sm"
          : isPast
            ? "border-border bg-muted/10 opacity-75"
            : "border-blue-200/60 bg-blue-50/40 dark:border-blue-800/40 dark:bg-blue-950/10"
      )}
    >
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
            onClick={stopClick}
          >
            <MapIcon className="h-3 w-3" />
            Mapa
          </a>
        )}
      </div>

      {/* Botões de acção */}
      <ActionButtons eventId={game.id} stopClick={stopClick} />
    </div>
  );
}

function ExtraGameCard({
  item, isNext, isPast,
}: {
  item: Extract<AgendaItem, { kind: "extra_game" }>;
  isNext: boolean;
  isPast: boolean;
}) {
  const router = useRouter();
  const ev = item.event;
  const meta = parseExtraMeta(ev);

  // Label do jogo
  const isTest     = ev.is_test;
  const isFriendly = ev.game_type === "friendly";
  const isTaca     = ev.competition === "Taça";
  const isHome     = meta?.is_home ?? null;
  const homeTeam   = meta?.home_team ?? (isHome ? "CD Póvoa Masters" : (ev.opponent ?? ""));
  const awayTeam   = meta?.away_team ?? (!isHome ? "CD Póvoa Masters" : (ev.opponent ?? ""));
  const pavilion   = meta?.pavilion ?? ev.location;
  const locality   = meta?.locality;
  const mapsUrl    = buildMapsUrl(pavilion, locality);

  function stopClick(e: React.MouseEvent) { e.stopPropagation(); }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/jogos/${ev.id}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/jogos/${ev.id}`)}
      className={cn(
        "rounded-xl border px-4 py-3 cursor-pointer transition-colors hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdpovoa-primary",
        isNext
          ? "border-cdpovoa-primary/40 bg-cdpovoa-primary/5 shadow-sm"
          : isPast
            ? "border-border bg-muted/10 opacity-75"
            : "border-blue-200/60 bg-blue-50/40 dark:border-blue-800/40 dark:bg-blue-950/10"
      )}
    >
      {/* Cabeçalho: badges */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {isTest && (
          <Badge variant="outline" className="text-[10px] border-slate-400/50 text-slate-500">Teste</Badge>
        )}
        {isFriendly && !isTest && (
          <Badge variant="outline" className="text-[10px] border-amber-400/60 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 gap-0.5">
            <Dumbbell className="h-2.5 w-2.5" />
            Amigável
          </Badge>
        )}
        {isTaca && (
          <Badge variant="outline" className="text-[10px] border-purple-400/60 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400 gap-0.5">
            <Swords className="h-2.5 w-2.5" />
            Taça
          </Badge>
        )}
        {ev.competition && !isTaca && !isFriendly && !isTest && (
          <Badge variant="outline" className="text-[10px] border-cdpovoa-primary/30 bg-cdpovoa-primary/5 text-cdpovoa-primary/80 gap-0.5">
            <Trophy className="h-2.5 w-2.5" />
            {ev.competition}
          </Badge>
        )}
        {isNext && (
          <Badge className="text-[10px] bg-cdpovoa-primary text-white ml-auto">Próximo jogo</Badge>
        )}
        {isHome !== null && (
          <Badge
            variant={isHome ? "default" : "outline"}
            className={cn(
              "text-[10px]",
              isHome
                ? "bg-cdpovoa-primary hover:bg-cdpovoa-primary/90"
                : "border-cdpovoa-primary/50 text-cdpovoa-primary"
            )}
          >
            <Shield className="h-2.5 w-2.5 mr-1" />
            {isHome ? "Casa" : "Fora"}
          </Badge>
        )}
      </div>

      {/* Equipas ou título */}
      {(meta?.home_team && meta?.away_team) ? (
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("flex-1 truncate", isHome && "text-cdpovoa-primary")}>{homeTeam}</span>
          <span className="text-muted-foreground text-xs font-normal shrink-0">vs</span>
          <span className={cn("flex-1 truncate text-right", !isHome && "text-cdpovoa-primary")}>{awayTeam}</span>
        </div>
      ) : (
        <p className="text-sm font-semibold truncate">
          {ev.title}
          {ev.opponent && <span className="font-normal text-muted-foreground"> vs. {ev.opponent}</span>}
        </p>
      )}

      {/* Data / hora / local */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {fmtDate(ev.event_date)}
        </span>
        {ev.event_time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {fmtTime(ev.event_time)}h
          </span>
        )}
        {pavilion && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {[pavilion, locality].filter(Boolean).join(", ")}
          </span>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-orange-500 hover:text-orange-600"
            onClick={stopClick}
          >
            <MapIcon className="h-3 w-3" />
            Mapa
          </a>
        )}
      </div>

      {/* Botões de acção */}
      <ActionButtons eventId={ev.id} stopClick={stopClick} />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────

export function LeagueAgenda({ allJornadas, jornadaMeta, rawGames, events, loading, isPlayer = true }: Props) {
  const [showPast, setShowPast] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  // IDs de eventos de teste (para ocultar a jogadores)
  const testEventIds = useMemo(
    () => new Set(events.filter((e) => e.is_test).map((e) => e.id)),
    [events]
  );

  // rawGames filtrados: jogadores não vêem jogos de teste
  const visibleRawGames = useMemo(
    () => isPlayer ? rawGames.filter((g) => !testEventIds.has(g.id)) : rawGames,
    [rawGames, testEventIds, isPlayer]
  );

  // Indexar o jogo do clube por jornada (apenas os nossos jogos da liga)
  const ourGamesByJornada = useMemo(() => {
    const map = new Map<number, LeagueGame>();
    for (const g of visibleRawGames) {
      if (g.is_our_game) map.set(g.syntheticJornada, g);
    }
    return map;
  }, [visibleRawGames]);

  // Primeira data de cada jornada (para Folgas sem jogo do clube)
  const firstDateByJornada = useMemo(() => {
    const map = new Map<number, string>();
    for (const g of rawGames) {
      if (!map.has(g.syntheticJornada)) map.set(g.syntheticJornada, g.event_date);
    }
    return map;
  }, [rawGames]);

  // Índice de IDs dos rawGames (para detectar jogos extra fora da liga)
  const rawGameIds = useMemo(() => new Set(rawGames.map((g) => g.id)), [rawGames]);

  // Jogos extra: is_club_game mas não estão no calendário da liga (amigáveis, Taça, etc.)
  // Jogadores não vêem jogos de teste
  const extraGames = useMemo(
    () => events.filter(
      (e) => e.type === "jogo" && !rawGameIds.has(e.id) && !e.deleted_at &&
             !(isPlayer && e.is_test)
    ),
    [events, rawGameIds, isPlayer]
  );

  // Construir lista combinada e ordenada por data
  const items = useMemo((): AgendaItem[] => {
    const result: AgendaItem[] = [];

    // Jornadas da liga (com ou sem o nosso jogo)
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

    // Jogos extra do clube (fora do calendário da liga)
    for (const e of extraGames) {
      result.push({ kind: "extra_game", date: e.event_date, event: e });
    }

    // Treinos e outros eventos (não jogos)
    for (const e of events) {
      if (e.type !== "jogo") {
        result.push({ kind: "event", date: e.event_date, event: e });
      }
    }

    // Ordenar por data (null → fundo)
    result.sort((a, b) => {
      const da = a.date ?? "9999-99-99";
      const db = b.date ?? "9999-99-99";
      return da.localeCompare(db);
    });

    return result;
  }, [allJornadas, jornadaMeta, ourGamesByJornada, firstDateByJornada, extraGames, events]);

  const pastItems     = useMemo(() => items.filter((i) => i.date && i.date <  today), [items, today]);
  const upcomingItems = useMemo(() => items.filter((i) => !i.date || i.date >= today), [items, today]);

  // Próximo jogo do clube (liga ou extra)
  const nextGameId = useMemo(() => {
    for (const item of upcomingItems) {
      if (item.kind === "game")       return item.game.id;
      if (item.kind === "extra_game") return item.event.id;
    }
    return null;
  }, [upcomingItems]);

  const pastGamesCount = pastItems.filter((i) => i.kind === "game" || i.kind === "extra_game").length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (allJornadas.length === 0 && extraGames.length === 0) {
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
    if (item.kind === "folga") {
      return <FolgaCard key={`j-${item.syntheticJornada}`} item={item} isPast={isPast} />;
    }
    if (item.kind === "event") {
      return <EventCard key={`ev-${item.event.id}`} item={item} isPast={isPast} />;
    }
    if (item.kind === "extra_game") {
      return (
        <ExtraGameCard
          key={`xg-${item.event.id}`}
          item={item}
          isNext={item.event.id === nextGameId}
          isPast={isPast}
        />
      );
    }
    return (
      <GameCard
        key={`g-${item.syntheticJornada}`}
        item={item}
        isNext={item.game.id === nextGameId}
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
