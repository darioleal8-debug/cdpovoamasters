import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";

export const runtime = "nodejs";

// Destino dos links de email do Supabase Auth (recuperação de password — UX-02).
// Troca o code (PKCE) por sessão e segue para ?next= (só caminhos internos).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("[auth/callback] exchangeCodeForSession falhou:", error.message);
  }
  return NextResponse.redirect(new URL("/login?reason=link_invalido", request.url));
}
