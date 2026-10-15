import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("news")
      .select("id, slug, title, excerpt, category, published_at, is_featured")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json(
      { articles: data ?? [] },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
