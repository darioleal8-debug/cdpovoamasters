import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evaluateAccess, type AuthProfile } from "@/lib/auth/roles";
import { ACTIVE_ROLE_COOKIE, homeForRole, parseActiveRoleRequest } from "@/lib/auth/active-role";

// POST /api/auth/active-role { role } — escolhe com que papel se usa a app.
// Valida contra os papéis reais (não usa authorize(), que já aplica o papel ativo).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile: AuthProfile | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("id, role, roles_extra, active")
      .eq("id", user.id)
      .maybeSingle();
    profile = (data as AuthProfile | null) ?? null;
  }

  const decision = evaluateAccess(!!user, profile, undefined);
  if (!decision.ok) return NextResponse.json({ success: false, error: decision.error }, { status: decision.status });

  const body = await req.json().catch(() => null);
  const parsed = parseActiveRoleRequest(profile!, body);
  if (!parsed.ok) return NextResponse.json({ success: false, error: "Papel inválido para esta conta." }, { status: 400 });

  const res = NextResponse.json({ success: true, role: parsed.role, home: homeForRole(parsed.role) });
  res.cookies.set(ACTIVE_ROLE_COOKIE, parsed.role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
