import type { HistExtractedPlayer, HistMatchedRow, HistCandidate, HistMatchStatus } from "./types";

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
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

function nameSim(pdfName: string, histName: string): number {
  const pn = normalize(pdfName);
  const hn = normalize(histName);
  if (pn === hn) return 1.0;
  if (hn.includes(pn) || pn.includes(hn)) return 0.92;
  const pTok = pn.split(" "), hTok = hn.split(" ");
  const pLast = pTok.at(-1) ?? "", hLast = hTok.at(-1) ?? "";
  if (pLast.length >= 3 && pLast === hLast) return 0.88;
  if (pTok[0] && hTok[0] && pTok[0] === hTok[0]) return 0.78;
  const max = Math.max(pn.length, hn.length);
  return max === 0 ? 1 : 1 - levenshtein(pn, hn) / max;
}

export function matchHistPlayers(
  extracted: HistExtractedPlayer[],
  existing: HistCandidate[]
): HistMatchedRow[] {
  return extracted.map((e) => {
    if (!existing.length) return newRow(e);

    const scored = existing
      .map((h) => ({ ...h, score: nameSim(e.pdf_name, h.name) }))
      .sort((a, b) => b.score - a.score);

    const HIGH = 0.82, LOW = 0.65;
    const good  = scored.filter((s) => s.score >= LOW);
    const best  = scored[0];

    if (!good.length) return newRow(e);

    if (best.score >= HIGH) {
      // Optionally boost if number also matches
      const numberMatch = e.pdf_number !== null &&
        good.some((s) => s.score >= HIGH); // we don't have jersey_number in hist_candidates here
      const matchType = e.pdf_number !== null && numberMatch ? "number+name" : "name";
      return {
        extracted:        e,
        hist_player_id:   best.id,
        hist_player_name: best.name,
        match_type:       matchType as HistMatchedRow["match_type"],
        status:           "ok" as HistMatchStatus,
        candidates:       [],
        new_player_name:  e.pdf_name,
        include:          true,
      };
    }

    if (good.length === 1) {
      return {
        extracted:        e,
        hist_player_id:   good[0].id,
        hist_player_name: good[0].name,
        match_type:       "name" as const,
        status:           "ambiguous" as HistMatchStatus,
        candidates:       good.map(({ score: _, ...g }) => g),
        new_player_name:  e.pdf_name,
        include:          true,
      };
    }

    return {
      extracted:        e,
      hist_player_id:   null,
      hist_player_name: null,
      match_type:       "none" as const,
      status:           "ambiguous" as HistMatchStatus,
      candidates:       good.slice(0, 5).map(({ score: _, ...g }) => g),
      new_player_name:  e.pdf_name,
      include:          true,
    };
  });
}

function newRow(e: HistExtractedPlayer): HistMatchedRow {
  return {
    extracted:        e,
    hist_player_id:   null,
    hist_player_name: null,
    match_type:       "none",
    status:           "new",
    candidates:       [],
    new_player_name:  e.pdf_name,
    include:          true,
  };
}
