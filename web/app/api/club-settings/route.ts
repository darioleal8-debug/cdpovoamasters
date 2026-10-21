import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ADMIN } from "@/lib/auth/roles";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

// ─── GET /api/club-settings ───────────────────────────────
export async function GET() {
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("club_settings")
    .select("*")
    .eq("id", "default")
    .single();

  if (error) {
    // Tabela ainda não existe — devolver defaults silenciosamente
    return NextResponse.json({
      id: "default",
      club_name: "CD Póvoa",
      logo_url: null,
      primary_color: "#111111",
      secondary_color: "#F28C28",
      accent_color: "#ffffff",
    });
  }

  return NextResponse.json(data);
}

// ─── PATCH /api/club-settings — atualizar cores/nome ─────
export async function PATCH(req: Request) {
  // Definições do clube: só admin (matriz de papéis; antes dava 500 cru da RLS a não-admins)
  const auth = await authorize(ADMIN);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const allowed = ["club_name", "primary_color", "secondary_color", "accent_color"];
  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("club_settings")
    .update(updates)
    .eq("id", "default")
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
