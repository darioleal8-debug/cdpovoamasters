import { analyzeSheet, toApplyPayload } from "./engine";
import { SheetDataSchema } from "./schema";

type LegacyExtraction = {
  arbitros?: string[];
  parciais?: { periodo: number; casa: number; fora: number }[];
  jogadores?: { nome: string; equipa: "casa" | "fora"; numero?: number | null; pontos?: number | null; triplos?: number | null; lances_livres?: number | null; faltas?: number | null }[];
  prolongamento?: boolean;
};

export type ApprovalPlan =
  | { ok: true; payload: Record<string, unknown>; source: "game_sheet" | "legacy" }
  | { ok: false; error: string; status: number };

/**
 * Constrói o payload de liga_apply_game_sheet a partir da submissão.
 *  - Com importação do boletim: recalcula TUDO a partir dos dados confirmados (nunca usa
 *    totais calculados pelo modelo) e bloqueia se houver erros materiais.
 *  - Sem importação (fluxo antigo/manual): mantém o comportamento anterior.
 */
export function buildApprovalPlan(
  submission: { home_score: number; away_score: number; extraction_raw: unknown; import_id: string | null },
  imp: { status: string; sheet_data: unknown } | null,
): ApprovalPlan {
  if (submission.import_id) {
    if (!imp) return { ok: false, status: 404, error: "Boletim associado à submissão não encontrado" };
    if (imp.status !== "confirmed" && imp.status !== "published") {
      return { ok: false, status: 409, error: "O delegado alterou o boletim depois de o submeter — aguarde nova confirmação." };
    }
    const parsed = SheetDataSchema.safeParse(imp.sheet_data);
    if (!parsed.success) return { ok: false, status: 422, error: "Dados do boletim inválidos" };
    const analysis = analyzeSheet(parsed.data);
    if (!analysis.canConfirm) {
      return { ok: false, status: 422, error: `Boletim com erros: ${analysis.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ")}` };
    }
    if (parsed.data.final.home !== submission.home_score || parsed.data.final.away !== submission.away_score) {
      return { ok: false, status: 409, error: "O resultado da submissão não coincide com o boletim confirmado." };
    }
    return { ok: true, source: "game_sheet", payload: toApplyPayload(parsed.data, analysis) };
  }

  const raw = (submission.extraction_raw ?? {}) as LegacyExtraction;
  const periods = (raw.parciais ?? []).map((p) => ({ periodo: p.periodo, home_points: p.casa, away_points: p.fora }));
  const players = (raw.jogadores ?? []).map((j) => ({
    side: j.equipa === "casa" ? "home" : "away",
    numero: j.numero ?? null,
    nome: j.nome,
    pontos: j.pontos ?? 0,
    triplos: j.triplos ?? 0,
    lances_livres: j.lances_livres ?? 0,
    faltas: j.faltas ?? 0,
    source: "legacy_scan",
  }));
  return {
    ok: true,
    source: "legacy",
    payload: {
      final: { home: submission.home_score, away: submission.away_score },
      overtime: raw.prolongamento === true,
      referees: raw.arbitros ?? [],
      // Comportamento anterior: só substitui quando a submissão traz dados
      periods: periods.length ? periods : null,
      players: players.length ? players : null,
    },
  };
}
