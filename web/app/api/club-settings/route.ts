import { NextResponse } from "next/server";
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
      club_name: "CD Póvoa Masters",
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
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

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
