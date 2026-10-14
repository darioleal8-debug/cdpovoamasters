import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("news")
      .select("id, slug, title, excerpt, body, category, published_at, is_featured, cover_image_url")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(
      { article: data },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
