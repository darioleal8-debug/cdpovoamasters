import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Rotas protegidas que requerem sessão activa
const PROTECTED_PREFIXES = [
  "/dashboard", "/jogadores", "/jogos", "/pagamentos", "/estatisticas",
  "/configuracoes", "/temporadas", "/treinos", "/financeiro",
  "/gestao-contas", "/historico", "/chat", "/mais", "/player",
  "/alterar-password", "/resultados",
];

function isProtected(path: string) {
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
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
  } = await supabase.auth.getUser();

  // Cookies Auth presentes mas sem sessão válida → stale (revogado / logout noutro dispositivo)
  const hasStaleAuthCookie =
    !user &&
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

  // /login com sessão válida confirmada → dashboard
  // Só redireciona se getUser() confirmar utilizador real; nunca por simples presença de cookie
  if (path.startsWith("/login") && user) {
    return buildRedirect(new URL("/dashboard", request.url));
  }

  // Passagem normal — devolve supabaseResponse para propagar tokens renovados
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Corre apenas em rotas de página; exclui assets estáticos, APIs e imagens
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
