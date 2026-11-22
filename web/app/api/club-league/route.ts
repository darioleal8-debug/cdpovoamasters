import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/auth/guards";
import { clubIdForUser, clubLeagueLink } from "@/lib/auth/club";

export const runtime = "nodejs";

// GET /api/club-league — liga do clube do utilizador autenticado ({ league: null } se não tiver)
export async function GET() {
  const authz = await authorize();
  if (!authz.ok) return authz.response;
  const { user, supabase } = authz;

  const clubId = await clubIdForUser(supabase, user.id);
  if (!clubId) return NextResponse.json({ league: null });

  const admin = await createAdminClient();
  const league = await clubLeagueLink(admin, clubId);
  return NextResponse.json({ league }, { headers: { "Cache-Control": "private, no-store" } });
}
