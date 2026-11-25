/**
 * Espelho do calendário da Liga INATEL para os clubes da app de gestão.
 *
 * Um clube associado a uma equipa da Liga (clubs.league_team_id) lê os jogos partilhados da Liga
 * (events.club_id IS NULL) em modo só de leitura — sem duplicar eventos. Este módulo é puro
 * (sem acesso a BD) para poder ser usado no servidor, no cliente e em testes.
 */

export interface LeagueTeamRef { id: string; name: string; is_placeholder?: boolean | null }

/** Nome comparável: sem acentos, minúsculas, espaços colapsados. */
export function normalizeTeamName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Equipa da Liga que corresponde ao nome do clube (igualdade exata normalizada).
 * Ignora placeholders ("Vencedor Jogo 1", "Equipa Teste") e equipas já associadas a outro clube.
 * Devolve null se não houver correspondência única — nesse caso o Master Admin associa à mão.
 */
export function matchLeagueTeam(
  clubName: string,
  teams: LeagueTeamRef[],
  usedTeamIds: ReadonlySet<string> = new Set(),
): LeagueTeamRef | null {
  const wanted = normalizeTeamName(clubName);
  if (!wanted) return null;
  const hits = teams.filter(
    (t) => !t.is_placeholder && !usedTeamIds.has(t.id) && normalizeTeamName(t.name) === wanted,
  );
  return hits.length === 1 ? hits[0] : null;
}

export interface LeagueEventMeta { home_team?: string; away_team?: string }

/** Lê home/away da description JSON de um evento da Liga; null se não for JSON válido. */
export function parseLeagueEventMeta(description: string | null | undefined): LeagueEventMeta | null {
  if (!description) return null;
  try {
    const m = JSON.parse(description) as LeagueEventMeta;
    return m && typeof m === "object" ? m : null;
  } catch {
    return null;
  }
}

/** O evento da Liga é um jogo da equipa `teamName`? Devolve o adversário (ou null se não for jogo dela). */
export function opponentIfTeamPlays(
  description: string | null | undefined,
  teamName: string,
): { opponent: string; isHome: boolean } | null {
  const meta = parseLeagueEventMeta(description);
  if (!meta?.home_team || !meta?.away_team) return null;
  if (meta.home_team === teamName) return { opponent: meta.away_team, isHome: true };
  if (meta.away_team === teamName) return { opponent: meta.home_team, isHome: false };
  return null;
}
