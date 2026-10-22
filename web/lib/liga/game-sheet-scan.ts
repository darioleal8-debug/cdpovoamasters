/**
 * Funções puras para parsing e validação da folha de jogo.
 * Separadas do route para permitir testes unitários.
 */

export interface QuarterScore {
  periodo: number;
  casa: number;
  fora: number;
}

export interface PlayerScan {
  equipa: "casa" | "fora";
  numero: number | null;
  nome: string;
  pontos: number;
  faltas: number | null;
  lances_livres?: number | null;
  triplos?: number | null;
}

export interface ScanExtraction {
  equipa_casa: string | null;
  equipa_fora: string | null;
  pontos_casa: number | null;
  pontos_fora: number | null;
  parciais: QuarterScore[];
  prolongamento: boolean;
  data: string | null;
  pavilhao: string | null;
  arbitros: string[];
  jogadores: PlayerScan[];
  confianca: number;
  avisos: string[];
}

/**
 * Remove markdown fences e texto envolvente, extrai o primeiro objecto JSON válido.
 * Lança SyntaxError se não encontrar JSON válido.
 */
export function parseJsonSafe(raw: string): Record<string, unknown> {
  // 1. Remover blocos ```json ... ``` ou ``` ... ```
  let cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();

  // 2. Se ainda não começa com { encontrar o primeiro {
  const start = cleaned.indexOf("{");
  const end   = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new SyntaxError(`Não encontrado objecto JSON em: ${raw.slice(0, 200)}`);
  }
  cleaned = cleaned.slice(start, end + 1);

  return JSON.parse(cleaned) as Record<string, unknown>;
}

/**
 * Valida que a soma dos parciais corresponde ao resultado final.
 * Devolve lista de avisos (vazia se tudo certo).
 */
export function validateQuarters(
  parciais: QuarterScore[],
  homeFinal: number,
  awayFinal: number,
): string[] {
  if (parciais.length === 0) return [];

  const sumHome = parciais.reduce((s, p) => s + (p.casa ?? 0), 0);
  const sumAway = parciais.reduce((s, p) => s + (p.fora ?? 0), 0);

  const warnings: string[] = [];
  if (sumHome !== homeFinal)
    warnings.push(`Soma parciais casa (${sumHome}) ≠ resultado final (${homeFinal})`);
  if (sumAway !== awayFinal)
    warnings.push(`Soma parciais fora (${sumAway}) ≠ resultado final (${awayFinal})`);
  return warnings;
}

/**
 * Ajusta confiança para baixo se a validação encontrou erros.
 */
export function penalizeConfidence(confidence: number, warnings: string[]): number {
  if (warnings.length === 0) return confidence;
  return Math.max(0, confidence - 0.2 * warnings.length);
}
