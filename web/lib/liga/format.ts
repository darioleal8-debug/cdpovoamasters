/** Funções puras de formatação de nomes de equipas — sem "use client", safe em Server Components */

export function teamHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fff;
  return h % 360;
}

export function teamAbbr(name: string): string {
  const stripped = name.replace(/^(bc|cd|gd|sc|ccd|acb?|str?)\s+/i, "").trim();
  const words = stripped.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}
