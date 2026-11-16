import { todayInClubTz } from "@/lib/time/club-time";

export type ShareableGame = {
  id: string;
  event_date: string;
  home_team: string;
  away_team: string;
  jornada: number | null;
  serie: string | null;
  result_status: "no_result" | "pending" | "approved";
};

/**
 * Jogo já realizado (hoje ou passado, fuso de Lisboa) e ainda sem resultado
 * submetido por ninguém — é nestes que faz sentido pedir aos delegados o resultado.
 * Jogos "pending" (já submetidos, à espera de validação) e "approved" ficam de fora.
 */
export function isAwaitingResult(game: Pick<ShareableGame, "event_date" | "result_status">, today = todayInClubTz()): boolean {
  return game.result_status === "no_result" && game.event_date <= today;
}

/**
 * Ligação que o delegado abre: se não tiver sessão passa pelo login e volta
 * ao fluxo de submissão já com o jogo escolhido.
 */
export function submitResultLink(origin: string, gameId: string): string {
  return `${origin}/liga-inatel/resultados/submeter?jogo=${encodeURIComponent(gameId)}`;
}

export function pendingResultMessage(game: ShareableGame, origin: string): string {
  const date = new Date(game.event_date + "T12:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "Europe/Lisbon",
  });
  const meta = [game.jornada ? `Jornada ${game.jornada}` : null, game.serie ? `Série ${game.serie}` : null]
    .filter(Boolean)
    .join(" · ");
  return [
    `🏀 Liga INATEL${meta ? ` — ${meta}` : ""}`,
    `${game.home_team} vs ${game.away_team} (${date})`,
    "",
    "O jogo já se realizou e falta submeter o resultado. Delegados, entrem aqui para o submeter:",
    submitResultLink(origin, game.id),
  ].join("\n");
}

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
