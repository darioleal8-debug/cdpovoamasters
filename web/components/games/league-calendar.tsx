"use client";

import { useMemo, useState } from "react";
import { MapPin, Clock, Calendar, Shield, ChevronDown, ChevronRight, Trophy, Map } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, buildMapsUrl } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import type { LeagueGame, LeagueJornada } from "@/hooks/use-league-calendar";
import type { TeamKit } from "@/types/database";
import { KitSwatch } from "@/components/settings/kit-preview";

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "EEE, d MMM yyyy", { locale: pt });
  } catch {
    return iso;
  }
}

function fmtTime(t: string): string {
  return t?.slice(0, 5) ?? "";
}

// ─── Linha de jogo individual ─────────────────────────────

function GameRow({ game, expanded, kitsByTeam }: { game: LeagueGame; expanded: boolean; kitsByTeam?: Record<string, TeamKit> }) {
  const isHome = game.is_home;
  const isOurs = game.is_our_game;

  const homeKit = kitsByTeam?.[game.home_team.toLowerCase()];
  const awayKit = kitsByTeam?.[game.away_team.toLowerCase()];
  // Para os nossos jogos: usar kit casa/fora consoante o mando
  const ourKit  = kitsByTeam?.[isHome ? game.home_team.toLowerCase() : game.away_team.toLowerCase()];

  return (
    <div
      className={cn(
        "group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-lg border px-4 py-3 transition-colors",
        isOurs
          ? "border-blue-200 bg-blue-50/60 dark:border-blue-800/50 dark:bg-blue-950/20"
          : "border-border hover:bg-muted/30"
      )}
    >
      {/* Faixa lateral azul nos nossos jogos */}
      {isOurs && (
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-cdpovoa-blue" />
      )}

      {/* Data + hora */}
      <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="text-xs font-medium capitalize text-muted-foreground">
          {fmtDate(game.event_date)}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {fmtTime(game.event_time)}h
        </span>
      </div>

      {/* Marcador central: visitado vs visitante */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        {/* Equipa casa (visitado) */}
        <span className="flex items-center justify-end gap-1.5 flex-1 min-w-0">
          <span className={cn("truncate text-sm font-semibold", isOurs && isHome && "text-cdpovoa-blue")}>
            {game.home_team}
          </span>
          {homeKit && (
            <KitSwatch
              jerseyColor={homeKit.jersey_home_color}
              shortsColor={homeKit.shorts_home_color}
              title={`${game.home_team} — Casa`}
            />
          )}
        </span>

        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
          vs
        </span>

        {/* Equipa visitante */}
        <span className="flex items-center gap-1.5 flex-1 min-w-0">
          {awayKit && (
            <KitSwatch
              jerseyColor={awayKit.jersey_away_color}
              shortsColor={awayKit.shorts_away_color}
              title={`${game.away_team} — Fora`}
            />
          )}
          <span className={cn("truncate text-sm font-semibold", isOurs && !isHome && "text-cdpovoa-blue")}>
            {game.away_team}
          </span>
        </span>
      </div>

      {/* Pavilhão + local */}
      {expanded && (
        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:w-48 sm:justify-end">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {game.pavilion ? game.pavilion : game.location}
            {game.locality ? `, ${game.locality}` : ""}
          </span>
        </div>
      )}

      {/* Badge Casa / Fora */}
      {isOurs && (
        <div className="shrink-0">
          <Badge
            variant={isHome ? "default" : "outline"}
            className={cn(
              "gap-1 text-[10px] font-semibold uppercase tracking-wide",
              isHome
                ? "bg-cdpovoa-blue hover:bg-cdpovoa-blue/90"
                : "border-cdpovoa-blue/50 text-cdpovoa-blue"
            )}
          >
            <Shield className="h-2.5 w-2.5" />
            {isHome ? "Casa" : "Fora"}
          </Badge>
        </div>
      )}

      {/* Ícone Google Maps */}
      {buildMapsUrl(game.pavilion, game.locality) && (
        <a
          href={buildMapsUrl(game.pavilion, game.locality)!}
          target="_blank"
          rel="noopener noreferrer"
          title={`Abrir no Google Maps: ${[game.pavilion, game.locality].filter(Boolean).join(", ")}`}
          className="shrink-0"
        >
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-orange-500 hover:bg-orange-50 hover:text-orange-600 transition-colors dark:hover:bg-orange-950/20">
            <Map className="h-3.5 w-3.5" />
          </button>
        </a>
      )}
    </div>
  );
}

// ─── Secção de uma jornada ─────────────────────────────────

function JornadaSection({
  jornada,
  showDetails,
  kitsByTeam,
}: {
  jornada: LeagueJornada;
  showDetails: boolean;
  kitsByTeam?: Record<string, TeamKit>;
}) {
  const [open, setOpen] = useState(true);

  const hasOurGame = jornada.our_game !== null;
  const dateLabel  = jornada.date_first ? fmtDate(jornada.date_first) : null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Cabeçalho da jornada */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40",
          hasOurGame && "bg-blue-50/40 dark:bg-blue-950/10"
        )}
      >
        {/* Número da jornada */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            hasOurGame
              ? "bg-cdpovoa-blue text-white"
              : "bg-muted text-muted-foreground"
          )}
        >
          {jornada.number}
        </div>

        <div className="flex flex-1 flex-col sm:flex-row sm:items-center sm:gap-4 min-w-0">
          <span className="font-semibold text-sm">Jornada {jornada.number}</span>
          {dateLabel && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {dateLabel}
            </span>
          )}
          {hasOurGame && (
            <Badge
              variant="outline"
              className="w-fit gap-1 border-cdpovoa-blue/40 bg-cdpovoa-blue/5 text-cdpovoa-blue text-[10px]"
            >
              <Trophy className="h-2.5 w-2.5" />
              O nosso jogo
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{jornada.games.length} jogos</span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Lista de jogos */}
      {open && (
        <div className="divide-y border-t px-3 py-2 space-y-1.5">
          {jornada.games.map((game) => (
            <div key={game.id} className="relative pt-1">
              <GameRow game={game} expanded={showDetails} kitsByTeam={kitsByTeam} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────

interface Stats {
  total_jornadas: number;
  total_games: number;
  our_games: number;
  home_games: number;
  away_games: number;
  next_game: LeagueGame | null;
}

function StatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Jornadas",      value: stats.total_jornadas },
        { label: "Jogos Liga",    value: stats.total_games },
        { label: "Nossos jogos",  value: stats.our_games },
        { label: "Casa / Fora",   value: `${stats.home_games}/${stats.away_games}` },
      ].map((s) => (
        <div
          key={s.label}
          className="rounded-lg border bg-card p-3 text-center shadow-sm"
        >
          <p className="text-xl font-bold text-cdpovoa-blue">{s.value}</p>
          <p className="text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Próximo jogo banner ──────────────────────────────────

function NextGameBanner({ game }: { game: LeagueGame }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-cdpovoa-blue/30 bg-cdpovoa-blue/5 p-4">
      <div className="flex items-center gap-2 shrink-0">
        <Trophy className="h-5 w-5 text-cdpovoa-blue" />
        <span className="text-sm font-semibold text-cdpovoa-blue">Próximo jogo</span>
        <Badge className="bg-cdpovoa-blue text-white text-[10px]">J{game.jornada}</Badge>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2 text-sm">
        <span className={cn("font-bold", game.is_home && "text-cdpovoa-blue")}>{game.home_team}</span>
        <span className="text-muted-foreground text-xs">vs</span>
        <span className={cn("font-bold", !game.is_home && "text-cdpovoa-blue")}>{game.away_team}</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {fmtDate(game.event_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {fmtTime(game.event_time)}h
          </span>
          {(game.pavilion || game.locality) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {game.locality || game.pavilion}
            </span>
          )}
        </span>
      </div>
      <Badge
        variant={game.is_home ? "default" : "outline"}
        className={cn(
          "shrink-0",
          game.is_home
            ? "bg-cdpovoa-blue hover:bg-cdpovoa-blue/90"
            : "border-cdpovoa-blue/50 text-cdpovoa-blue"
        )}
      >
        {game.is_home ? "Casa" : "Fora"}
      </Badge>

      {buildMapsUrl(game.pavilion, game.locality) && (
        <a
          href={buildMapsUrl(game.pavilion, game.locality)!}
          target="_blank"
          rel="noopener noreferrer"
          title={`Abrir no Google Maps: ${[game.pavilion, game.locality].filter(Boolean).join(", ")}`}
          className="shrink-0"
        >
          <button className="flex h-8 w-8 items-center justify-center rounded-md text-orange-500 hover:bg-orange-100 hover:text-orange-600 transition-colors">
            <Map className="h-4 w-4" />
          </button>
        </a>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────

interface LeagueCalendarProps {
  jornadas: LeagueJornada[];
  allJornadas: number[];
  stats: Stats;
  loading: boolean;
  showOnlyOurs: boolean;
  onToggleOurs: (v: boolean) => void;
  selectedJornada: number | "all";
  onSelectJornada: (v: number | "all") => void;
  kitsByTeam?: Record<string, TeamKit>;
}

export function LeagueCalendar({
  jornadas,
  allJornadas,
  stats,
  loading,
  showOnlyOurs,
  onToggleOurs,
  selectedJornada,
  onSelectJornada,
  kitsByTeam,
}: LeagueCalendarProps) {
  const [showDetails, setShowDetails] = useState(true);

  const totalGames = useMemo(
    () => jornadas.reduce((n, j) => n + j.games.length, 0),
    [jornadas]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
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

  return (
    <div className="space-y-5">
      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Próximo jogo */}
      {stats.next_game && <NextGameBanner game={stats.next_game} />}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle: apenas os nossos */}
          <button
            onClick={() => onToggleOurs(!showOnlyOurs)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              showOnlyOurs
                ? "border-cdpovoa-blue bg-cdpovoa-blue text-white"
                : "border-border bg-background hover:bg-muted"
            )}
          >
            <Shield className="h-3.5 w-3.5" />
            Apenas os nossos jogos
          </button>

          {/* Seletor de jornada */}
          <Select
            value={String(selectedJornada)}
            onValueChange={(v) =>
              onSelectJornada(v === "all" ? "all" : parseInt(v, 10))
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtrar jornada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as jornadas</SelectItem>
              {allJornadas.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Jornada {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Toggle detalhe */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails((d) => !d)}
            className="gap-1.5"
          >
            <MapPin className="h-3.5 w-3.5" />
            {showDetails ? "Ocultar pavilhões" : "Mostrar pavilhões"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground shrink-0">
          {jornadas.length} jornada(s) · {totalGames} jogo(s)
        </p>
      </div>

      {/* Nenhum resultado com filtro ativo */}
      {jornadas.length === 0 && (
        <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <p>Nenhum jogo encontrado com os filtros aplicados.</p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              onToggleOurs(false);
              onSelectJornada("all");
            }}
          >
            Limpar filtros
          </Button>
        </div>
      )}

      {/* Jornadas */}
      <div className="space-y-3">
        {jornadas.map((j) => (
          <JornadaSection key={j.number} jornada={j} showDetails={showDetails} kitsByTeam={kitsByTeam} />
        ))}
      </div>
    </div>
  );
}
