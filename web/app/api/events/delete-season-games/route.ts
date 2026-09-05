import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ success: true, ...data });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

// POST /api/events/delete-season-games
// Body: { season_id: string }
// Deletes all events of type "jogo" for the season.
// Games with game_sessions or game_callups are protected and skipped.
export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const admin = await createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (userRow?.role !== "admin") return fail("Acesso negado — apenas admins", 403);

  const body = await req.json().catch(() => ({})) as { season_id?: string };
  const { season_id } = body;
  if (!season_id) return fail("season_id obrigatório");

  // Fetch all game events for the season
  const { data: events, error: fetchErr } = await admin
    .from("events")
    .select("id")
    .eq("type", "jogo")
    .eq("season_id", season_id);

  if (fetchErr) return fail(`Erro ao carregar jogos: ${fetchErr.message}`, 500);

  const allIds = (events ?? []).map(e => e.id as string);
  if (allIds.length === 0) {
    return ok({ total: 0, deleted: 0, protected: 0, message: "Nenhum jogo encontrado nesta temporada." });
  }

  // Find which games have associated sessions or callups
  const [{ data: sessions }, { data: callups }] = await Promise.all([
    admin.from("game_sessions").select("event_id").in("event_id", allIds),
    admin.from("game_callups").select("game_id").in("game_id", allIds),
  ]);

  const protectedIds = new Set([
    ...(sessions ?? []).map(s => s.event_id as string),
    ...(callups ?? []).map(c => c.game_id as string),
  ]);

  const safeToDelete = allIds.filter(id => !protectedIds.has(id));
  const protectedCount = allIds.length - safeToDelete.length;

  if (safeToDelete.length === 0) {
    return ok({
      total: allIds.length,
      deleted: 0,
      protected: protectedCount,
      message: `Todos os ${allIds.length} jogos estão protegidos (têm estatísticas ou convocatórias associadas) e não foram eliminados.`,
    });
  }

  const { error: delErr } = await admin
    .from("events")
    .delete()
    .in("id", safeToDelete);

  if (delErr) return fail(`Erro ao eliminar jogos: ${delErr.message}`, 500);

  console.log(`[delete-season-games] season=${season_id} deleted=${safeToDelete.length} protected=${protectedCount}`);

  return ok({
    total: allIds.length,
    deleted: safeToDelete.length,
    protected: protectedCount,
    message: protectedCount > 0
      ? `${safeToDelete.length} jogo(s) eliminado(s). ${protectedCount} protegido(s) por ter estatísticas ou convocatórias.`
      : `${safeToDelete.length} jogo(s) eliminado(s) com sucesso.`,
  });
}
