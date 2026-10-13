import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase  = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const eventId    = searchParams.get("event_id");
  const trainingId = searchParams.get("training_id");

  // players.name foi removido na migration 041 — usar v_roster para nome/foto

  // ── Jogo ─────────────────────────────────────────────────────
  if (eventId) {
    // game_callups não tem status nem event_id (CONV-04); a resposta do atleta vive em game_availability
    const [{ data: callups }, { data: availability }] = await Promise.all([
      supabase.from("game_callups").select("player_id").eq("game_id", eventId),
      supabase.from("game_availability").select("player_id, status").eq("game_id", eventId),
    ]);
    const availabilityByPlayer = new Map(
      ((availability ?? []) as Array<{ player_id: string; status: string }>).map((a) => [a.player_id, a.status])
    );
    const toPanelStatus = (s: string | undefined) =>
      s === "available" ? "confirmado" : s === "unavailable" ? "indisponivel" : "pendente";

    const playerIds = (callups ?? []).map((c) => c.player_id as string).filter(Boolean);
    const { data: roster } = playerIds.length > 0
      ? await supabase.from("v_roster").select("player_id, name, position, photo_url").in("player_id", playerIds)
      : { data: [] };
    const byId = new Map((roster ?? []).map((r) => [r.player_id as string, r]));

    const players = (callups ?? []).map((c) => {
      const r = byId.get(c.player_id as string);
      return {
        id:        r?.player_id ?? "",
        name:      r?.name      ?? "—",
        position:  r?.position  ?? null,
        photo_url: r?.photo_url ?? null,
        status:    toPanelStatus(availabilityByPlayer.get(c.player_id as string)),
      };
    });

    return NextResponse.json({ players });
  }

  // ── Treino ────────────────────────────────────────────────────
  if (trainingId) {
    const { data: attendances } = await supabase
      .from("training_attendance")
      .select("player_id, status")
      .eq("training_id", trainingId)
      .in("status", ["present", "late"]);

    const playerIds = (attendances ?? []).map((a) => a.player_id as string).filter(Boolean);
    const { data: roster } = playerIds.length > 0
      ? await supabase.from("v_roster").select("player_id, name, position, photo_url").in("player_id", playerIds)
      : { data: [] };
    const byId = new Map((roster ?? []).map((r) => [r.player_id as string, r]));

    const players = (attendances ?? []).map((a) => {
      const r = byId.get(a.player_id as string);
      return {
        id:        r?.player_id ?? "",
        name:      r?.name      ?? "—",
        position:  r?.position  ?? null,
        photo_url: r?.photo_url ?? null,
        status:    "confirmado" as const,
      };
    });

    return NextResponse.json({ players });
  }

  return NextResponse.json({ players: [] });
}
