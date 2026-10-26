import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { MANAGERS } from "@/lib/auth/roles";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ─── GET /api/player-documents?season_id=...&player_id=... ──
export async function GET(req: NextRequest) {
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const sp        = req.nextUrl.searchParams;
  const seasonId  = sp.get("season_id");
  const playerId  = sp.get("player_id");

  if (!seasonId) return fail("season_id obrigatório");

  let query = supabase
    .from("player_documents")
    .select("*")
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false });

  if (playerId) query = query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok({ documents: data ?? [] });
}

// ─── POST /api/player-documents ──────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await authorize(MANAGERS);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const { player_id, season_id, title, category = "outro", status = "pendente",
          file_url, storage_key, expires_at, notes } = body as Record<string, string>;

  if (!player_id || !season_id || !title) return fail("player_id, season_id e title são obrigatórios");

  const { data, error } = await supabase
    .from("player_documents")
    .insert({
      player_id, season_id, title, category, status,
      file_url: file_url || null,
      storage_key: storage_key || null,
      expires_at: expires_at || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return fail(error.message, 500);
  return ok({ document: data }, 201);
}
