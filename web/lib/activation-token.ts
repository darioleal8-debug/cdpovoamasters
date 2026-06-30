// Tokens de ativação auto-contidos via HMAC-SHA256.
// Não requerem base de dados — o token codifica userId + expiração + assinatura.
// A assinatura usa SUPABASE_SERVICE_ROLE_KEY como secret (já disponível no servidor).

import { createHmac, timingSafeEqual } from "crypto";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return s;
}

// Formato: base64url( userId : expiresAt : hmac(userId:expiresAt) )
export function createActivationToken(userId: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload   = `${userId}:${expiresAt}`;
  const sig       = createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export type VerifyResult =
  | { ok: true;  userId: string }
  | { ok: false; reason: "invalid" | "expired" };

export function verifyActivationToken(token: string): VerifyResult {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");

    // Extrair sig (último segmento) e payload (tudo antes)
    const lastColon = raw.lastIndexOf(":");
    if (lastColon === -1) return { ok: false, reason: "invalid" };

    const payload = raw.slice(0, lastColon);
    const sig     = raw.slice(lastColon + 1);

    // Extrair userId e expiresAt do payload
    const firstColon = payload.indexOf(":");
    if (firstColon === -1) return { ok: false, reason: "invalid" };

    const userId    = payload.slice(0, firstColon);
    const expiresAt = Number(payload.slice(firstColon + 1));
    if (!userId || isNaN(expiresAt)) return { ok: false, reason: "invalid" };

    // Verificação timing-safe para prevenir timing attacks
    const expected    = createHmac("sha256", secret()).update(payload).digest("hex");
    const sigBuf      = Buffer.from(sig,      "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return { ok: false, reason: "invalid" };
    }

    if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

    return { ok: true, userId };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function activationLink(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/activate?token=${token}`;
}
