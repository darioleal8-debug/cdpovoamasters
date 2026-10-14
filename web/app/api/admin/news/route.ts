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

// GET — list all (including drafts)
export async function GET() {
  try {
    const supabase = await createClient();
    const user = await checkAdmin(supabase);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabase
      .from("news")
      .select("id, slug, title, excerpt, category, published_at, is_published, is_featured, created_at, updated_at")
      .order("published_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ articles: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST — create
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const user = await checkAdmin(supabase);
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { slug, title, excerpt, body: articleBody, category, published_at, is_published, is_featured } = body;

    if (!slug || !title || !excerpt) {
      return NextResponse.json({ error: "slug, title e excerpt são obrigatórios" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("news")
      .insert({
        slug,
        title,
        excerpt,
        body: articleBody ?? "",
        category: category ?? "Geral",
        published_at: published_at ?? new Date().toISOString(),
        is_published: is_published ?? false,
        is_featured: is_featured ?? false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ article: data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
