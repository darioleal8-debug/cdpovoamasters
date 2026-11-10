/** Validação das subscrições Web Push (endpoints só de serviços push conhecidos — evita SSRF). */

const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.microsoft\.com$/,
];
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string }

export function parseSubscription(body: unknown): { ok: true; value: PushSubscriptionInput } | { ok: false; error: string } {
  const b = body as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } } | null;
  const s = b?.subscription;
  if (!s || typeof s.endpoint !== "string" || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") {
    return { ok: false, error: "Subscrição inválida" };
  }
  if (s.endpoint.length > 600 || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) return { ok: false, error: "Subscrição inválida" };
  let url: URL;
  try { url = new URL(s.endpoint); } catch { return { ok: false, error: "Endpoint inválido" }; }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((re) => re.test(url.hostname))) return { ok: false, error: "Serviço push não suportado" };
  if (!B64URL.test(s.keys.p256dh) || !B64URL.test(s.keys.auth)) return { ok: false, error: "Chaves inválidas" };
  return { ok: true, value: { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth } };
}
