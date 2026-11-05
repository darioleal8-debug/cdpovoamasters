import { jsonrepair } from "jsonrepair";

/**
 * Tenta interpretar JSON devolvido por um LLM, reparando defeitos comuns.
 *
 * 1. JSON.parse direto.
 * 2. Correções dirigidas a falhas vistas no DeepSeek (ex.: `{"name":"X"},"},"players"` —
 *    aspa solta antes de `}`/`]`), aplicadas apenas fora de strings.
 * 3. `jsonrepair` (vírgulas finais, aspas em falta, JSON truncado, etc.).
 *
 * Devolve `undefined` se nenhuma das tentativas resultar.
 */
export function parseLooseJSON<T = unknown>(text: string): T | undefined {
  const candidates: string[] = [text];
  const fixed = fixStrayQuotes(text);
  if (fixed !== text) candidates.push(fixed);

  for (const c of candidates) {
    try { return JSON.parse(c) as T; } catch { /* próxima */ }
  }
  for (const c of candidates) {
    try {
      const v = JSON.parse(jsonrepair(c)) as unknown;
      // jsonrepair transforma texto livre numa string — só aceitamos objetos/arrays
      if (v !== null && typeof v === "object") return v as T;
    } catch { /* próxima */ }
  }
  return undefined;
}

/**
 * Remove aspas soltas que aparecem depois de uma vírgula e imediatamente antes de `}` ou `]`
 * (fora de strings): `,"}` → `}` e `,"]` → `]`. Também remove vírgulas finais (`,}` / `,]`).
 */
export function fixStrayQuotes(src: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === ",") {
      // olhar em frente: espaços, [aspa solta], espaços, fecho
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      let k = j;
      if (src[k] === '"') {
        k++;
        while (k < src.length && /\s/.test(src[k])) k++;
      }
      if (src[k] === "}" || src[k] === "]") {
        // descarta a vírgula e a aspa solta; o fecho é processado na próxima iteração
        i = k;
        continue;
      }
    }
    if (ch === '"') inString = true;
    out += ch;
    i++;
  }
  return out;
}
