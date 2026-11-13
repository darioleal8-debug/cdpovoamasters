import { NextResponse } from "next/server";
import { createUnscopedAdminClient } from "@/lib/supabase/server";
import { parseSubscription } from "@/lib/liga/push/subscription";

export const runtime = "nodejs";

/** Registar subscrição push (público: qualquer pessoa com a app instalada). Endpoint validado contra serviços push conhecidos. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 4000) return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  const parsed = parseSubscription(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = await createUnscopedAdminClient();
  const { error } = await db.from("liga_push_subscriptions").upsert(
    { ...parsed.value, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200), last_seen_at: new Date().toISOString() },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "Não foi possível guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Cancelar subscrição (conhece o endpoint = é o próprio dispositivo). */
export async function DELETE(req: Request) {
  let endpoint: unknown;
  try { endpoint = (await req.json())?.endpoint; } catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }
  if (typeof endpoint !== "string" || endpoint.length > 600) return NextResponse.json({ error: "Endpoint inválido" }, { status: 400 });
  const db = await createUnscopedAdminClient();
  await db.from("liga_push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
