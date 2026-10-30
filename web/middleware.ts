import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { shouldRedirectFromLogin } from "@/lib/auth/session-cookie";
import { safeNextPath } from "@/lib/auth/safe-next";

// Rotas protegidas que requerem sessão activa (clube)
const PROTECTED_PREFIXES = [
  "/dashboard", "/jogadores", "/jogos", "/pagamentos", "/estatisticas",
  "/configuracoes", "/temporadas", "/treinos", "/financeiro",
  "/gestao-contas", "/historico", "/chat", "/mais", "/player",
  "/alterar-password", "/resultados", "/liga",
];

function isProtected(path: string) {
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

// Rotas de delegado: requerem apenas sessão Supabase válida (membership verificada no layout)
// Rotas de liga admin: requerem sessão Supabase + cookie hh_user_type=liga_admin
const DELEGATE_LOGIN = "/liga-inatel/equipa/login";

function isDelegateRoute(path: string) {
  return (
    (path === "/liga-inatel/equipa" || path.startsWith("/liga-inatel/equipa/")) &&
    !path.startsWith(DELEGATE_LOGIN)
  );
}

function isLigaAdminRoute(path: string) {
  return path === "/liga-inatel/admin" || path.startsWith("/liga-inatel/admin/");
}

// Prefixo dos cookies de sessão do Supabase (base + chunks .0 .1 …)
const SB_AUTH_COOKIE_PREFIX = "sb-";
const SB_AUTH_COOKIE_SUFFIX = "-auth-token";

function isAuthCookie(name: string) {
  return name.startsWith(SB_AUTH_COOKIE_PREFIX) && name.includes(SB_AUTH_COOKIE_SUFFIX);
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // supabaseResponse acumula Set-Cookie de token refresh — NUNCA substitua por NextResponse.next() nu
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // Propaga refresh tokens tanto no request (para RSC a jusante) como na resposta
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Única fonte de verdade: valida junto ao servidor Auth — detecta sessões revogadas.
  // Nunca usar getSession() para decisões de redirect: confia apenas no JWT local.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Cookies Auth presentes mas validação falhou com erro 4xx → stale (revogado/expirado).
  // Não limpar em erros de rede (status ausente) para evitar logout acidental por falha transitória.
  const authErrStatus = (authError as { status?: number } | null)?.status ?? 0;
  const hasStaleAuthCookie =
    !user &&
    authErrStatus >= 400 &&
    authErrStatus < 500 &&
    request.cookies.getAll().some((c) => isAuthCookie(c.name));

  // Copia cookies de refresh do supabaseResponse e, se stale, elimina-os do browser
  function buildRedirect(url: URL): NextResponse {
    const res = NextResponse.redirect(url);
    // Propaga tokens renovados (não perder o refresh que o SDK fez)
    supabaseResponse.cookies.getAll().forEach(({ name, value, ...opts }) => {
      res.cookies.set({ name, value, ...opts });
    });
    if (hasStaleAuthCookie) {
      // maxAge:0 diz ao browser para apagar o cookie → quebra o loop na próxima visita
      for (const cookie of request.cookies.getAll()) {
        if (isAuthCookie(cookie.name)) {
          res.cookies.set({
            name: cookie.name,
            value: "",
            maxAge: 0,
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        }
      }
    }
    return res;
  }

  // Rota protegida sem sessão válida → login
  if (isProtected(path) && !user) {
    return buildRedirect(new URL("/login", request.url));
  }

  // Rota de liga admin: requer sessão + cookie liga_admin
  if (isLigaAdminRoute(path)) {
    if (!user) {
      return buildRedirect(new URL(`${DELEGATE_LOGIN}?msg=admin_required`, request.url));
    }
    const userTypeCookie = request.cookies.get("hh_user_type")?.value;
    if (userTypeCookie !== "liga_admin") {
      return buildRedirect(new URL(`${DELEGATE_LOGIN}?msg=admin_required`, request.url));
    }
  }

  // Rota de delegado: requer apenas sessão Supabase válida.
  // A verificação de membership (league_team_members) é feita no DelegateAuthLayout,
  // evitando dependência do cookie hh_user_type que pode ficar dessincronizado.
  if (isDelegateRoute(path)) {
    if (!user) {
      const loginUrl = new URL(DELEGATE_LOGIN, request.url);
      loginUrl.searchParams.set("redirect", path + request.nextUrl.search);
      return buildRedirect(loginUrl);
    }
  }

  // /login com sessão válida confirmada → dashboard (ou redirectTo se seguro)
  // Só redireciona se getUser() confirmar utilizador real; nunca por simples presença de cookie
  // reason=inactive|noprofile: o /login termina a sessão — redirecionar aqui criava um ciclo
  if (path.startsWith("/login") && user && shouldRedirectFromLogin(true, request.nextUrl.searchParams)) {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");
    const safe = safeNextPath(redirectTo);
    const dest = safe === "/" ? "/dashboard" : safe;
    return buildRedirect(new URL(dest, request.url));
  }

  // Passagem normal — devolve supabaseResponse para propagar tokens renovados
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Corre apenas em rotas de página; exclui assets estáticos, APIs e imagens
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|liga-inatel\\.webmanifest|liga-inatel-sw\\.js|liga-inatel-offline\\.html|pwa/|icons/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
