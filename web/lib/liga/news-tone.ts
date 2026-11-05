/**
 * Tom editorial das notícias da Liga INATEL: amistoso e respeitador.
 * Uma vitória dilatada descreve-se pela vantagem, nunca pela "humilhação" do adversário.
 */

/** Termos agressivos/ofensivos proibidos (formas base; a verificação apanha flexões). */
const AGGRESSIVE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "atropelar", re: /\batropel\w*/i },
  { label: "esmagar", re: /\besmag\w*/i },
  { label: "arrasar", re: /\barras(?!t)\w*/i },
  { label: "massacrar", re: /\bmassacr\w*/i },
  { label: "humilhar", re: /\bhumilh\w*/i },
  { label: "trucidar", re: /\btrucid\w*/i },
  { label: "aniquilar", re: /\baniquil\w*/i },
  { label: "destroçar", re: /\bdestro[cç]\w*/i },
  { label: "destruir", re: /\bdestru[ií]\w*/i },
  { label: "demolir", re: /\bdemol\w*/i },
  { label: "triturar", re: /\btritur\w*/i },
  { label: "cilindrar", re: /\bcilindr\w*/i },
  { label: "despedaçar", re: /\bdespeda[cç]\w*/i },
  { label: "dizimar", re: /\bdizim\w*/i },
  { label: "chacina", re: /\bchacin\w*/i },
  { label: "carnificina", re: /\bcarnific\w*/i },
  { label: "goleada/cabazada", re: /\b(?:cabazad\w*|banho de bola)\b/i },
  { label: "dar uma abada", re: /\babad(?:a|as)\b/i },
  { label: "vexar", re: /\bvex(?:ame|ante|ar|ad)\w*/i },
  { label: "sovar", re: /\bsov(?:a|ar|ou|ad)\w*/i },
  { label: "passeio", re: /\bpasse(?:io|ar|ou)\b/i },
  { label: "impiedoso", re: /\bimpiedos\w*|\bsem piedade\b/i },
  { label: "KO", re: /\bK\.?O\.?\b|\bknock-?out\b/i },
];

/** Devolve os termos agressivos encontrados no texto (rótulos únicos). */
export function aggressiveTerms(text: string): string[] {
  const found = new Set<string>();
  for (const { label, re } of AGGRESSIVE_PATTERNS) {
    if (re.test(text)) found.add(label);
  }
  return [...found];
}

/** Regras de tom acrescentadas a qualquer prompt (também aos personalizados pelo admin). */
export const NEWS_TONE_RULES = `TOM AMISTOSO (obrigatório):
- Escreve com respeito por todas as equipas — é uma liga amadora de veteranos, de convívio e fair-play.
- NUNCA uses termos agressivos ou ofensivos, como: atropelar, esmagar, arrasar, massacrar, humilhar, trucidar, aniquilar, destroçar, demolir, cilindrar, triturar, goleada/cabazada, abada, "passeio", "sem piedade", KO.
- Para uma vantagem dilatada usa formulações positivas centradas no vencedor: "vitória folgada", "triunfo claro", "vence com autoridade", "impõe-se com clareza", "vantagem confortável", "exibição convincente", "vence com margem confortável".
- Sobre a equipa derrotada, sê respeitoso (ex.: "não conseguiu travar", "lutou até ao fim", "procurará reagir na próxima jornada"); nunca a ridicularizes.`;
