import { NextResponse, type NextRequest } from "next/server";

// Rotas protegidas que requerem sessão activa
const PROTECTED_PREFIXES = [
  "/dashboard", "/jogadores", "/jogos", "/pagamentos", "/estatisticas",
  "/configuracoes", "/temporadas", "/treinos", "/financeiro",
  "/gestao-contas", "/historico", "/chat", "/mais", "/player",
  "/alterar-password",
];

// Cookie de sessão Supabase — formato: sb-<project-ref>-auth-token
// A presença do cookie indica sessão válida; a validação JWT real ocorre nos server components.
const SESSION_COOKIE = "sb-uhszagzrhdfzpfztuati-auth-token";

function isProtected(path: string) {
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function middleware(request: NextRequest) {
  const path     = request.nextUrl.pathname;
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;

  if (isProtected(path) && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (path.startsWith("/login") && hasSession) {
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
