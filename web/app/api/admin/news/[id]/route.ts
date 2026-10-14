import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function checkAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("role, roles_extra")
    .eq("email", user.email!)
    .single();
  const roles = [profile?.role, ...(profile?.roles_extra ?? [])].filter(Boolean);
  return roles.includes("admin") ? user : null;
}

// PATCH — update
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const user = await checkAdmin(supabase);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    const supabase = await createClient();
    const user = await checkAdmin(supabase);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { error } = await supabase.from("news").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
