import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { canManageContent } from "@/lib/permissions";

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

// Depois de migration 041, players.name foi removido — o nome vive em users.name.
// v_roster (migration 042) expõe player_id, name, number, position, photo_url com o JOIN correto.
async function enrichCallups(
  supabase: Awaited<ReturnType<typeof getSupabase>>["supabase"],
  callupRows: { id: string; game_id: string; player_id: string; created_at: string }[]
) {
  if (!callupRows.length) return [];

  const playerIds = callupRows.map((c) => c.player_id);
  const { data: roster } = await supabase
    .from("v_roster")
    .select("player_id, name, number, position, photo_url")
    .in("player_id", playerIds);

  const byId = new Map((roster ?? []).map((r) => [r.player_id as string, r]));

  return callupRows.map((c) => {
    const p = byId.get(c.player_id);
    return {
      ...c,
      player: {
        id:        c.player_id,
        name:      p?.name      ?? "",
        number:    p?.number    ?? null,
        position:  p?.position  ?? null,
        photo_url: p?.photo_url ?? null,
      },
    };
  });
}

// ─── GET /api/games/[id]/callups ─────────────────────────
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: game_id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const { data, error } = await supabase
    .from("game_callups")
    .select("id, game_id, player_id, created_at")
    .eq("game_id", game_id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[callups GET]", error.message);
    return fail("Não foi possível carregar os convocados.", 500);
  }

  const callups = await enrichCallups(supabase, (data ?? []) as Parameters<typeof enrichCallups>[1]);
  return ok({ callups });
}

// ─── POST /api/games/[id]/callups ────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: game_id } = await params;
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const { data: caller } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!caller || !canManageContent(caller.role)) {
    return fail("Apenas administradores e treinadores podem convocar jogadores", 403);
  }

  let body: { player_id: string };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }
  if (!body.player_id) return fail("player_id é obrigatório");

  const { data: game } = await supabase
    .from("events")
    .select("id, type, season_id")
    .eq("id", game_id)
    .maybeSingle();
  if (!game) return fail("Jogo não encontrado", 404);
  if (game.type !== "jogo") return fail("Este evento não é um jogo", 400);

  const { data: player } = await supabase
    .from("players")
    .select("id, season_id")
    .eq("id", body.player_id)
    .maybeSingle();
  if (!player) return fail("Jogador não encontrado", 404);
  if (player.season_id !== game.season_id) {
    return fail("Este jogador não pertence ao plantel da temporada deste jogo", 400);
  }

  const { data: inserted, error } = await supabase
    .from("game_callups")
    .insert({ game_id, player_id: body.player_id, created_by: user.id })
    .select("id, game_id, player_id, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return fail("Este jogador já está convocado", 409);
    console.error("[callups POST] insert:", error.message);
    return fail("Não foi possível convocar o jogador. Tenta novamente.", 500);
  }

  const [callup] = await enrichCallups(
    supabase,
    [inserted as { id: string; game_id: string; player_id: string; created_at: string }]
  );
  return ok({ callup }, 201);
}
