import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/server";
import { countUnread } from "@/lib/announcements/load";

export const runtime = "nodejs";

// ─── GET /api/announcements/unread-count — badge do menu ─────────────────────
export async function GET() {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const db = await createAdminClient();
  return NextResponse.json({ unread_count: await countUnread(db, auth.user.id) });
}
