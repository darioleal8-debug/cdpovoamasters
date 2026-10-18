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

// GET — list all (including drafts)
export async function GET() {
  try {
    const checked = await checkAdmin();
    if (!checked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { supabase, user } = checked;

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
    const checked = await checkAdmin();
    if (!checked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { supabase, user } = checked;

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
