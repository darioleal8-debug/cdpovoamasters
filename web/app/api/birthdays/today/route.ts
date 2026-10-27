import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/auth/guards";
import { isBirthdayTodayLisbon, calculateAgeLisbon, getTodayLisbon } from "@/lib/birthday-utils";

export const runtime = "nodejs";

export interface BirthdayPlayer {
  player_id:           string;
  user_id:             string;
  name:                string;
  birth_date:          string;
  age:                 number;
  photo_url:           string | null;
  processed_photo_url: string | null;
  photo_focal_x:       number | null;
  photo_focal_y:       number | null;
  number:              number | null;
  position:            string | null;
  team_id:             string | null;
}

export async function GET(req: NextRequest) {
  // Dados do plantel do clube (datas de nascimento, fotos): só contas ativas do clube
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  // Dev override: simulate birthday for a specific player
  const simulateId = process.env.NODE_ENV !== "production"
    ? sp.get("simulateBirthday")
    : null;

  const db = await createAdminClient();

  // Fetch active season if no season_id given
  let seasonId = sp.get("season_id");
  if (!seasonId) {
    const { data: season } = await db
      .from("seasons")
      .select("id")
      .eq("status", "ativa")
      .maybeSingle();
    seasonId = season?.id ?? null;
  }
  if (!seasonId) return NextResponse.json({ players: [] });

  // Fetch all players for this season with birth_date
  const { data: players } = await db
    .from("players")
    .select("id, user_id, number, position, team_id, birth_date, photo_url, processed_photo_url, photo_focal_x, photo_focal_y")
    .eq("season_id", seasonId)
    .not("birth_date", "is", null)
    .not("user_id", "is", null);

  if (!players?.length) return NextResponse.json({ players: [] });

  // Get names from users table
  const userIds = players.map((p) => p.user_id as string);
  const { data: usersData } = await db
    .from("users")
    .select("id, name")
    .in("id", userIds);
  const nameMap = new Map((usersData ?? []).map((u) => [u.id as string, u.name as string]));

  // Filter to today's birthdays (Lisbon timezone)
  const todayPlayers: BirthdayPlayer[] = players
    .filter((p) => {
      if (simulateId) return p.id === simulateId;
      return isBirthdayTodayLisbon(p.birth_date as string);
    })
    .map((p) => ({
      player_id:           p.id as string,
      user_id:             p.user_id as string,
      name:                nameMap.get(p.user_id as string) ?? "Jogador",
      birth_date:          p.birth_date as string,
      age:                 calculateAgeLisbon(p.birth_date as string),
      photo_url:           p.photo_url as string | null,
      processed_photo_url: p.processed_photo_url as string | null,
      photo_focal_x:       p.photo_focal_x as number | null,
      photo_focal_y:       p.photo_focal_y as number | null,
      number:              p.number as number | null,
      position:            p.position as string | null,
      team_id:             p.team_id as string | null,
    }));

  // Also: if today is Feb 28 in a non-leap year, include Feb 29 players
  const today = getTodayLisbon();
  const year  = today.getFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (!simulateId && !isLeap && today.getMonth() === 1 && today.getDate() === 28) {
    const feb29Players: BirthdayPlayer[] = players
      .filter((p) => {
        const bd = p.birth_date as string;
        return bd && bd.slice(5) === "02-29" && !todayPlayers.find((t) => t.player_id === (p.id as string));
      })
      .map((p) => ({
        player_id:           p.id as string,
        user_id:             p.user_id as string,
        name:                nameMap.get(p.user_id as string) ?? "Jogador",
        birth_date:          p.birth_date as string,
        age:                 calculateAgeLisbon(p.birth_date as string),
        photo_url:           p.photo_url as string | null,
        processed_photo_url: p.processed_photo_url as string | null,
        photo_focal_x:       p.photo_focal_x as number | null,
        photo_focal_y:       p.photo_focal_y as number | null,
        number:              p.number as number | null,
        position:            p.position as string | null,
        team_id:             p.team_id as string | null,
      }));
    todayPlayers.push(...feb29Players);
  }

  return NextResponse.json({ players: todayPlayers });
}
