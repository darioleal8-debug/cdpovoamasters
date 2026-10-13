import type { ExtractedPlayerStats, MatchedRow, MatchStatus, RosterCandidate } from "./types";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function nameSimilarity(pdfName: string, rosterName: string): number {
  const pn = normalize(pdfName);
  const rn = normalize(rosterName);

  if (!pn || !rn) return 0;
  if (pn === rn) return 1.0;

  const pTok = pn.split(" ");
  const rTok = rn.split(" ");
  const pLast = pTok.at(-1) ?? "";
  const rLast = rTok.at(-1) ?? "";

  // "P. Silva": inicial + apelido — só conta se a inicial bater com o primeiro nome
  const initial = pTok.length >= 2 && /^[a-z]\.?$/.test(pTok[0]) ? pTok[0][0] : null;
  if (initial && pLast.length >= 3 && pLast === rLast) {
    return rTok[0]?.startsWith(initial) ? 0.9 : 0.5;
  }

  // Inclusão (ex.: "rui costa" ⊂ "rui costa santos") — exige ≥ 3 caracteres
  if (pn.length >= 3 && (rn.includes(pn) || pn.includes(rn))) return 0.92;

  // Apelido igual (mín. 3 caracteres para evitar falsos positivos)
  if (pLast.length >= 3 && pLast === rLast) return 0.88;

  // Primeiro nome igual
  if (pTok[0] && rTok[0] && pTok[0] === rTok[0]) return 0.80;

  // Levenshtein normalizado
  const maxLen = Math.max(pn.length, rn.length);
  return 1 - levenshtein(pn, rn) / maxLen;
}

export function matchPlayers(
  extracted: ExtractedPlayerStats[],
  roster: RosterCandidate[]
): MatchedRow[] {
  // Um jogador do plantel só pode ser associado automaticamente a UMA linha do PDF (STA-13)
  const assigned = new Set<string>();
  const strip = ({ score: _, ...g }: RosterCandidate & { score: number }) => g;

  return extracted.map((e) => {
    // 1. Número da camisola
    if (e.pdf_number !== null) {
      const byNum = roster.filter((r) => r.number === e.pdf_number);
      if (byNum.length === 1 && !assigned.has(byNum[0].id)) {
        assigned.add(byNum[0].id);
        return row(e, byNum[0], "number", "ok", []);
      }
      if (byNum.length > 1) {
        return unresolved(e, "number", "ambiguous", byNum);
      }
    }

    // Sem nome utilizável → não associar (includes("") era sempre verdadeiro)
    if (!normalize(e.pdf_name ?? "")) {
      return unresolved(e, "none", "unmatched", []);
    }

    // 2. Semelhança de nome
    const scored = roster
      .map((r) => ({ ...r, score: nameSimilarity(e.pdf_name, r.name) }))
      .sort((a, b) => b.score - a.score);

    const THRESHOLD = 0.65;
    const good = scored.filter((s) => s.score >= THRESHOLD);
    if (good.length === 0) {
      return unresolved(e, "none", "unmatched", []);
    }

    const [best, second] = good;
    // "ok" automático só com confiança alta E sem empate próximo (ex.: dois "Rui")
    const clearWinner = best.score >= 0.88 && (!second || second.score < best.score - 0.05);
    if (clearWinner && !assigned.has(best.id)) {
      assigned.add(best.id);
      return row(e, best, "name", "ok", []);
    }

    return unresolved(e, "name", "ambiguous", good.slice(0, 5).map(strip));
  });
}

function row(
  e: ExtractedPlayerStats,
  p: RosterCandidate,
  matchType: "number" | "name",
  status: MatchStatus,
  candidates: RosterCandidate[]
): MatchedRow {
  return {
    extracted:     e,
    player_id:     p.id,
    player_name:   p.name,
    player_number: p.number,
    match_type:    matchType,
    status,
    candidates,
    include:       true,
  };
}

function unresolved(
  e: ExtractedPlayerStats,
  matchType: "number" | "name" | "none",
  status: MatchStatus,
  candidates: RosterCandidate[]
): MatchedRow {
  return {
    extracted:     e,
    player_id:     null,
    player_name:   null,
    player_number: null,
    match_type:    matchType,
    status,
    candidates,
    include:       status !== "unmatched",
  };
}
