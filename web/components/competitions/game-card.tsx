import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PublicGame } from "@/types/competitions";

const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

interface Props {
  game: PublicGame;
  competitionSlug: string;
  compact?: boolean;
}

export function GameCard({ game, competitionSlug, compact }: Props) {
  const isApproved = game.result_status === "approved";
  const isLive     = game.result_status === "live";
  const isPending  = game.result_status === "pending";

  const content = (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        compact ? "p-3" : "p-4",
        isLive
          ? "border-orange-400 bg-orange-500/5"
          : game.is_our_game
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-border bg-card",
        (isApproved || isLive) && "hover:bg-muted/50"
      )}
    >
      {/* Header row: jornada + date + status */}
      <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
        <span>{game.jornada ? `Jornada ${game.syntheticJornada}` : "—"}</span>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="inline-flex items-center gap-1 text-orange-500 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
              AO VIVO
            </span>
          )}
          {isPending && !isLive && (
            <span className="text-amber-500">resultado pendente</span>
          )}
          <span>{formatDate(game.event_date)}</span>
          {game.event_time && <span>{game.event_time.slice(0, 5)}</span>}
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className={cn("flex-1 text-right", compact ? "text-sm" : "text-base")}>
          <span className={cn("font-semibold leading-tight", game.is_our_game && game.home_team.toLowerCase().includes("póvoa") && "text-orange-600 dark:text-orange-400")}>
            {game.home_team}
          </span>
        </div>

        {/* Score / separator */}
        <div className={cn(
          "flex-shrink-0 text-center tabular-nums font-bold min-w-[56px]",
          compact ? "text-lg" : "text-2xl"
        )}>
          {isApproved || isLive ? (
            <span>
              <span className={game.result!.home_score > game.result!.away_score ? "" : "text-muted-foreground"}>
                {game.result!.home_score}
              </span>
              <span className="text-muted-foreground mx-1 text-lg">–</span>
              <span className={game.result!.away_score > game.result!.home_score ? "" : "text-muted-foreground"}>
                {game.result!.away_score}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-lg font-normal">vs</span>
          )}
        </div>

        {/* Away team */}
        <div className={cn("flex-1 text-left", compact ? "text-sm" : "text-base")}>
          <span className={cn("font-semibold leading-tight", game.is_our_game && game.away_team.toLowerCase().includes("póvoa") && "text-orange-600 dark:text-orange-400")}>
            {game.away_team}
          </span>
        </div>
      </div>

      {/* Location */}
      {game.location && !compact && (
        <p className="text-center text-xs text-muted-foreground mt-2 truncate">{game.location}</p>
      )}
    </div>
  );

  const href = isApproved || isLive
    ? (isLive && game.live_game_url) ? game.live_game_url : `/liga-inatel/jogo/${game.id}`
    : null;

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }
  return content;
}
