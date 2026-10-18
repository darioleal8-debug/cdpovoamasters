import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ADMIN } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Sessão + conta ativa + admin (papel ativo); antes procurava o perfil por email
async function checkAdmin() {
  const auth = await authorize(ADMIN);
  return auth.ok ? { user: auth.user, supabase: auth.supabase } : null;
}

// PATCH — update
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const checked = await checkAdmin();
    if (!checked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { supabase, user } = checked;

    const { id } = await params;
    const updates = await req.json();

    // Only allow safe fields to be updated
    const allowed = ["slug", "title", "excerpt", "body", "category", "published_at", "is_published", "is_featured", "cover_image_url"];
    const patch = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    const { data, error } = await supabase
      .from("news")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ article: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const checked = await checkAdmin();
    if (!checked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { supabase, user } = checked;

    const { id } = await params;
    const { error } = await supabase.from("news").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
