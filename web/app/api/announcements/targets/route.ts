import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ANNOUNCERS } from "@/lib/auth/roles";
import { clubIdForUser } from "@/lib/auth/club";
import { createAdminClient } from "@/lib/supabase/server";
import { listUpcomingGames, listUpcomingTrainings } from "@/lib/announcements/targets";

export const runtime = "nodejs";

// ─── GET /api/announcements/targets — jogos e treinos a que se pode afetar um comunicado ──
export async function GET() {
  const auth = await authorize(ANNOUNCERS);
  if (!auth.ok) return auth.response;
  const db = await createAdminClient();
  const clubId = await clubIdForUser(db, auth.user.id);
  if (!clubId) return NextResponse.json({ games: [], trainings: [] });
  const [games, trainings] = await Promise.all([listUpcomingGames(db, clubId), listUpcomingTrainings(db)]);
  return NextResponse.json({ games, trainings });
}
