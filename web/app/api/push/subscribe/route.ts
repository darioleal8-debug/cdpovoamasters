import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/server";
import { parseSubscription } from "@/lib/liga/push/subscription";

export const runtime = "nodejs";

// ─── POST /api/push/subscribe — regista o dispositivo do utilizador com sessão ──
// Se o dispositivo já estava registado por outra conta (telemóvel partilhado), passa para esta.
export async function POST(req: Request) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const raw = await req.text();
  if (raw.length > 4000) return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  const parsed = parseSubscription(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = await createAdminClient();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      ...parsed.value,
      user_id: auth.user.id,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "Não foi possível guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/push/subscribe — deixa de notificar este dispositivo ────────
export async function DELETE(req: Request) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  let endpoint: unknown;
  try { endpoint = (await req.json())?.endpoint; } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  if (typeof endpoint !== "string" || endpoint.length > 600) return NextResponse.json({ error: "Endpoint inválido" }, { status: 400 });
  const db = await createAdminClient();
  await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", auth.user.id);
  return NextResponse.json({ ok: true });
}
