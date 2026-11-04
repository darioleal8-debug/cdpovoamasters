import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { CalledUpPlayer } from "@/types/callups";

export type { CalledUpPlayer };

// Convocados por jogo, visíveis a todo o plantel.
//
// A RLS de game_callups só devolve ao jogador a sua própria linha, e a de
// users só o próprio nome. Tal como o Plantel (/player/plantel), lemos aqui
// com o cliente de serviço — expondo apenas nome, número e posição, que já são
// públicos dentro do clube. Quem chama TEM de ter feito authorize() antes.

export async function getCallupsByGame(
  gameIds: string[],
): Promise<Map<string, CalledUpPlayer[]>> {
  const out = new Map<string, CalledUpPlayer[]>();
  if (gameIds.length === 0) return out;

  const admin = await createAdminClient();

  const { data: callups, error } = await admin
    .from("game_callups")
    .select("game_id, player_id, created_at")
    .in("game_id", gameIds)
    .order("created_at", { ascending: true });
  if (error || !callups || callups.length === 0) return out;

  const playerIds = [...new Set(callups.map((c) => c.player_id as string))];
  const { data: players } = await admin
    .from("players")
    .select("id, number, position, user_id")
    .in("id", playerIds);

  const userIds = [...new Set((players ?? []).map((p) => p.user_id as string | null).filter((x): x is string => !!x))];
  const nameByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await admin.from("users").select("id, name").in("id", userIds);
    (users ?? []).forEach((u) => nameByUser.set(u.id as string, (u.name as string | null) ?? ""));
  }

  const playerById = new Map(
    (players ?? []).map((p) => [
      p.id as string,
      {
        number:   (p.number as number | null) ?? null,
        position: (p.position as string | null) ?? null,
        name:     nameByUser.get(p.user_id as string) || "Jogador",
      },
    ]),
  );

  for (const c of callups) {
    const p = playerById.get(c.player_id as string);
    if (!p) continue;
    const list = out.get(c.game_id as string) ?? [];
    list.push({ player_id: c.player_id as string, ...p });
    out.set(c.game_id as string, list);
  }

  // Ordena por número da camisola (sem número no fim), depois por nome
  for (const list of out.values()) {
    list.sort((a, b) =>
      (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name, "pt"),
    );
  }
  return out;
}
