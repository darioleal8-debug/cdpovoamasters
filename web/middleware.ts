import type { SerializeOptions } from "cookie";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type SupabaseCookiesToSet = {
  name: string;
  value: string;
  options: SerializeOptions;
}[];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: SupabaseCookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuth = !!user;
  const path = request.nextUrl.pathname;
  const isLoginPage = path.startsWith("/login");
  const isDashboard = path === "/" || path.startsWith("/jogadores") ||
    path.startsWith("/jogos") || path.startsWith("/pagamentos") ||
    path.startsWith("/estatisticas") || path.startsWith("/configuracoes");

  if (isDashboard && !isAuth) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isLoginPage && isAuth) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
