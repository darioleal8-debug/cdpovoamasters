import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { clubIdForUser, clubLeagueLink } from "@/lib/auth/club";

export const runtime = "nodejs";

// GET /api/club-league — liga do clube do utilizador autenticado ({ league: null } se não tiver)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const clubId = await clubIdForUser(supabase, user.id);
  if (!clubId) return NextResponse.json({ league: null });

  const admin = await createAdminClient();
  const league = await clubLeagueLink(admin, clubId);
  return NextResponse.json({ league }, { headers: { "Cache-Control": "private, no-store" } });
}
