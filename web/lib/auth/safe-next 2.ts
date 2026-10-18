/** Só caminhos relativos da própria app (evita open redirect via ?next=). */
export function safeNextPath(next: string | null | undefined): string {
  // Caracteres de controlo e "\" são removidos/normalizados pelo parser de URL ("/\t/evil.com" → //evil.com)
  if (!next || !next.startsWith("/") || /[\x00-\x1F\x7F\\]/.test(next)) return "/";
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
