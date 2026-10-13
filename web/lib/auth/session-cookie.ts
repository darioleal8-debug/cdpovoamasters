/** Cookies de sessão do Supabase: `sb-<ref>-auth-token` ou dividido em `…-auth-token.0`, `.1`, … */
const SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/;

export function hasSessionCookie(cookies: { name: string; value: string }[]): boolean {
  return cookies.some((c) => SESSION_COOKIE.test(c.name) && c.value.length > 0);
}

/** /login só reencaminha para o dashboard se houver sessão de uma conta ativa e com perfil no clube. */
export function shouldRedirectFromLogin(hasSession: boolean, params: URLSearchParams): boolean {
  const reason = params.get("reason");
  return hasSession && reason !== "inactive" && reason !== "noprofile";
}
