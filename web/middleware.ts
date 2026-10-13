import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie, shouldRedirectFromLogin } from "@/lib/auth/session-cookie";

// Rotas protegidas que requerem sessão activa
const PROTECTED_PREFIXES = [
  "/dashboard", "/jogadores", "/jogos", "/pagamentos", "/estatisticas",
  "/configuracoes", "/temporadas", "/treinos", "/financeiro",
  "/gestao-contas", "/historico", "/chat", "/mais", "/player",
  "/alterar-password",
];

// A presença do cookie de sessão (inteiro ou dividido em .0/.1) só serve para encaminhar;
// a validação real da sessão e do papel acontece nos server components e rotas (lib/auth/guards).

function isProtected(path: string) {
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const path     = request.nextUrl.pathname;
  const hasSession = hasSessionCookie(request.cookies.getAll());

  if (isProtected(path) && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (path.startsWith("/login") && shouldRedirectFromLogin(hasSession, request.nextUrl.searchParams)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Corre apenas em rotas de página; exclui assets estáticos, APIs e imagens
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
