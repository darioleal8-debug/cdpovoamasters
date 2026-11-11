import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/auth/guards";
import { getNextBirthday, getTodayLisbon } from "@/lib/birthday-utils";

export const runtime = "nodejs";

export interface NextBirthday {
  player_id:   string;
  name:        string;
  /** Data do aniversário (YYYY-MM-DD) */
  date:        string;
  days_until:  number;
  turning_age: number;
  /** Outros jogadores que fazem anos no mesmo dia */
  others:      string[];
}

function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Próximo aniversário (depois de hoje) de um jogador do plantel da época ativa. */
export async function GET(req: NextRequest) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const db = await createAdminClient();

  let seasonId = req.nextUrl.searchParams.get("season_id");
  if (!seasonId) {
    const { data: season } = await db
      .from("seasons")
      .select("id")
      .eq("status", "ativa")
      .maybeSingle();
    seasonId = season?.id ?? null;
  }
  if (!seasonId) return NextResponse.json({ next: null });

  const { data: players } = await db
    .from("players")
    .select("id, user_id, birth_date")
    .eq("season_id", seasonId)
    .not("birth_date", "is", null)
    .not("user_id", "is", null);

  if (!players?.length) return NextResponse.json({ next: null });

  const today = getTodayLisbon();
  const upcoming = players
    .map((p) => ({ p, nb: getNextBirthday(p.birth_date as string, today) }))
    .filter((x): x is { p: (typeof players)[number]; nb: NonNullable<ReturnType<typeof getNextBirthday>> } => x.nb !== null)
    .sort((a, b) => a.nb.daysUntil - b.nb.daysUntil);

  if (!upcoming.length) return NextResponse.json({ next: null });

  const soonest = upcoming[0].nb.daysUntil;
  const group = upcoming.filter((x) => x.nb.daysUntil === soonest);

  const { data: usersData } = await db
    .from("users")
    .select("id, name")
    .in("id", group.map((x) => x.p.user_id as string));
  const nameMap = new Map((usersData ?? []).map((u) => [u.id as string, u.name as string]));

  const [first, ...rest] = group;
  const next: NextBirthday = {
    player_id:   first.p.id as string,
    name:        nameMap.get(first.p.user_id as string) ?? "Jogador",
    date:        toIsoDate(first.nb.date),
    days_until:  first.nb.daysUntil,
    turning_age: first.nb.turningAge,
    others:      rest.map((x) => nameMap.get(x.p.user_id as string) ?? "Jogador"),
  };

  return NextResponse.json({ next });
}
