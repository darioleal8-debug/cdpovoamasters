// Verificação k-anonymity via HaveIBeenPwned Pwned Passwords API.
// A password e o hash completo nunca saem do browser.
// Política fail-open: erros de rede/timeout devolvem checked=false.

export interface PwnedResult {
  pwned:   boolean;
  count:   number;
  checked: boolean;
}

async function sha1Hex(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export async function checkPwnedPassword(password: string): Promise<PwnedResult> {
  const FAIL_OPEN: PwnedResult = { pwned: false, count: 0, checked: false };

  try {
    const hash   = await sha1Hex(password);
    const prefix = hash.slice(0, 5);   // enviado à API
    const suffix = hash.slice(5);      // comparado localmente, nunca sai do browser

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 3_000);

    let response: Response;
    try {
      response = await fetch(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        { signal: controller.signal, headers: { "Add-Padding": "true" } },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.warn("[pwned-passwords] API devolveu status", response.status);
      return FAIL_OPEN;
    }

    const text = await response.text();

    for (const line of text.split("\n")) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      const count = parseInt(line.slice(sep + 1), 10);
      if (count === 0) continue; // linha de padding (Add-Padding: true)
      if (line.slice(0, sep).toUpperCase() === suffix) {
        return { pwned: true, count, checked: true };
      }
    }

    return { pwned: false, count: 0, checked: true };
  } catch (err) {
    console.warn(
      "[pwned-passwords] Verificação falhou (fail-open):",
      err instanceof Error ? err.message : String(err),
    );
    return FAIL_OPEN;
  }
}

export const PWNED_ERROR_MESSAGE =
  "Esta password apareceu em fugas de dados conhecidas. " +
  "Escolhe outra password para proteger a tua conta.";
