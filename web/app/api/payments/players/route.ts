import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { clubIdForUser } from "@/lib/auth/club";
import { createAdminClient } from "@/lib/supabase/server";
import type { RosterEntry, UserRole } from "@/types/database";

export const runtime = "nodejs";

const PAYMENTS_VIEWERS = ["admin", "tesoureiro", "treinador", "seccionista"] as const satisfies readonly UserRole[];

// GET /api/payments/players?season_id= — jogadores do clube do utilizador (e só desse), para os Pagamentos.
// Nem o Master Admin vê jogadores de outros clubes: o clube vem sempre da afetação do próprio utilizador.
export async function GET(req: NextRequest) {
  const auth = await authorize(PAYMENTS_VIEWERS);
  if (!auth.ok) return auth.response;

  const seasonId = req.nextUrl.searchParams.get("season_id");
  if (!seasonId) return NextResponse.json({ error: "season_id obrigatório" }, { status: 400 });

  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ players: [] });

  const db = await createAdminClient();
  const { data: season } = await db.from("seasons").select("id").eq("id", seasonId).eq("club_id", clubId).maybeSingle();
  if (!season) return NextResponse.json({ players: [] });

  // `users` já só devolve os membros do clube do pedido
  const [{ data: users, error: uErr }, { data: profiles, error: pErr }] = await Promise.all([
    db.from("users")
      .select("id, name, email, phone, active, roles_extra, created_at")
      .or('role.eq.jogador,roles_extra.cs.["jogador"]'),
    db.from("players")
      .select("id, user_id, season_id, number, position, height, weight, age, birth_date, photo_url, original_photo_url, processed_photo_url, photo_focal_x, photo_focal_y, photo_template_version, team_id, created_at")
      .eq("club_id", clubId)
      .eq("season_id", seasonId),
  ]);
  if (uErr || pErr) return NextResponse.json({ error: (uErr ?? pErr)!.message }, { status: 500 });

  const byUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const players: RosterEntry[] = (users ?? []).map((u) => {
    const p = byUser.get(u.id as string);
    return {
      id: u.id as string,
      user_id: u.id as string,
      player_id: p ? (p.id as string) : null,
      season_id: p ? (p.season_id as string) : null,
      name: u.name as string,
      email: u.email as string,
      phone: (u.phone as string | null) ?? null,
      active: u.active as boolean,
      roles_extra: ((u.roles_extra as UserRole[]) ?? []),
      number: (p?.number as number | null) ?? null,
      position: (p?.position as RosterEntry["position"]) ?? null,
      height: (p?.height as number | null) ?? null,
      weight: (p?.weight as number | null) ?? null,
      age: (p?.age as number | null) ?? null,
      birth_date: (p?.birth_date as string | null) ?? null,
      photo_url: (p?.photo_url as string | null) ?? null,
      original_photo_url: (p?.original_photo_url as string | null) ?? null,
      processed_photo_url: (p?.processed_photo_url as string | null) ?? null,
      photo_focal_x: (p?.photo_focal_x as number | null) ?? null,
      photo_focal_y: (p?.photo_focal_y as number | null) ?? null,
      photo_template_version: (p?.photo_template_version as number | null) ?? null,
      team_id: (p?.team_id as string | null) ?? null,
      created_at: (p?.created_at ?? u.created_at) as string,
    };
  });

  players.sort((a, b) => {
    if (a.number !== null && b.number !== null) return a.number - b.number;
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return a.name.localeCompare(b.name, "pt");
  });
  return NextResponse.json({ players });
}
