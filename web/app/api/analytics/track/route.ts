import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { event_type?: string; page?: string; action?: string; metadata?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event_type = body.event_type ?? "page_view";
  if (!["page_view", "action"].includes(event_type)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await supabase.from("user_activity_logs").insert({
    user_id:    user.id,
    event_type,
    page:       body.page    ?? null,
    action:     body.action  ?? null,
    metadata:   body.metadata ?? null,
  });

  return NextResponse.json({ ok: true });
}
