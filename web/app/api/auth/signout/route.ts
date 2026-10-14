import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

// GET /api/auth/signout
// Termina a sessão Supabase e redireciona para /login com cookies limpos.
// Usado pelos layouts server-side que precisam de fazer signOut antes de ir para /login,
// evitando o loop middleware ↔ protected-route quando a sessão é válida mas o perfil não.
export async function GET() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Route Handler — nunca deve falhar, mas protege por precaução
          }
        },
      },
    }
  );

  // Termina apenas a sessão local (não invalida o token noutros dispositivos)
  await supabase.auth.signOut({ scope: "local" });

  const response = NextResponse.redirect(
    new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "https://hoophub.pt"),
    { status: 302 }
  );

  // Garante que os cookies são eliminados mesmo que signOut não os limpe
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      response.cookies.set({
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

  return response;
}
