import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("news")
    .select("id, slug, title, cover_image_url, image_status, image_prompt, published_at, is_published, home_team_name, away_team_name, game_id")
    .eq("category", "Liga INATEL")
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ news: data ?? [] });
}
