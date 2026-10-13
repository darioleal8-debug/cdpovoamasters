import type { HistExtractedPlayer, HistMatchedRow, HistCandidate, HistMatchStatus } from "./types";
import { nameSimilarity, normalize } from "@/lib/stats-importer/matcher";

export function matchHistPlayers(
  extracted: HistExtractedPlayer[],
  existing: HistCandidate[]
): HistMatchedRow[] {
  // Mesma pontuação do importador de estatísticas; um jogador histórico só pode ser
  // associado automaticamente a UMA linha, e empates próximos ficam "ambiguous" (STA-13)
  const assigned = new Set<string>();

  return extracted.map((e) => {
    if (!normalize(e.pdf_name ?? "")) {
      // Sem nome: nem associar nem criar jogador sem nome
      return { ...newRow(e), status: "ambiguous" as HistMatchStatus, include: false };
    }
    if (!existing.length) return newRow(e);

    const scored = existing
      .map((h) => ({ ...h, score: nameSimilarity(e.pdf_name, h.name) }))
      .sort((a, b) => b.score - a.score);

    const HIGH = 0.82, LOW = 0.65;
    const good = scored.filter((s) => s.score >= LOW);
    if (!good.length) return newRow(e);

    const [best, second] = good;
    const clearWinner = best.score >= HIGH && (!second || second.score < best.score - 0.05);
    if (clearWinner && !assigned.has(best.id)) {
      assigned.add(best.id);
      return {
        extracted:        e,
        hist_player_id:   best.id,
        hist_player_name: best.name,
        match_type:       "name" as const,
        status:           "ok" as HistMatchStatus,
        candidates:       [],
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
