import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertProgress } from "@/lib/plays-data";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.playId || typeof body.playId !== "string") {
    return NextResponse.json({ error: "playId required" }, { status: 400 });
  }

  await upsertProgress(body.playId, user.id, body.studied === true);
  return NextResponse.json({ ok: true });
}
