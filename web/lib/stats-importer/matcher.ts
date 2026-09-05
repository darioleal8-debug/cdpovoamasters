import type { ExtractedPlayerStats, MatchedRow, MatchStatus, RosterCandidate } from "./types";

function normalize(s: string): string {
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

function nameSimilarity(pdfName: string, rosterName: string): number {
  const pn = normalize(pdfName);
  const rn = normalize(rosterName);

  if (pn === rn) return 1.0;
  if (rn.includes(pn) || pn.includes(rn)) return 0.92;

  const pTok = pn.split(" ");
  const rTok = rn.split(" ");

  // Last name match (min 3 chars to avoid false positives)
  const pLast = pTok.at(-1) ?? "";
  const rLast = rTok.at(-1) ?? "";
  if (pLast.length >= 3 && pLast === rLast) return 0.88;

  // First name match + partial last
  if (pTok[0] && rTok[0] && pTok[0] === rTok[0]) return 0.80;

  // Levenshtein normalised
  const maxLen = Math.max(pn.length, rn.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(pn, rn) / maxLen;
}

export function matchPlayers(
  extracted: ExtractedPlayerStats[],
  roster: RosterCandidate[]
): MatchedRow[] {
  return extracted.map((e) => {
    // 1. Match by jersey number
    if (e.pdf_number !== null) {
      const byNum = roster.filter((r) => r.number === e.pdf_number);
      if (byNum.length === 1) {
        return row(e, byNum[0], "number", "ok", []);
      }
      if (byNum.length > 1) {
        return unresolved(e, "number", "ambiguous", byNum);
      }
    }

    // 2. Match by name similarity
    const scored = roster
      .map((r) => ({ ...r, score: nameSimilarity(e.pdf_name, r.name) }))
      .sort((a, b) => b.score - a.score);

    const THRESHOLD = 0.65;
    const good = scored.filter((s) => s.score >= THRESHOLD);

    if (good.length === 0) {
      return unresolved(e, "none", "unmatched", []);
    }

    if (good.length === 1 || good[0].score >= 0.88) {
      const match = good[0];
      const status: MatchStatus = match.score >= 0.88 ? "ok" : "ambiguous";
      const candidates = status === "ambiguous"
        ? good.slice(0, 5).map(({ score: _, ...g }) => g)
        : [];
      return row(e, match, "name", status, candidates);
    }

    // Multiple candidates with close scores → ambiguous
    return unresolved(e, "name", "ambiguous", good.slice(0, 5).map(({ score: _, ...g }) => g));
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
