import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Schema = z.object({ ids: z.array(z.string().uuid()).max(200).optional() });

// ─── POST /api/announcements/read — marca como vistos ({ ids } ou, sem ids, todos os recentes) ──
export async function POST(req: NextRequest) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  let json: unknown = {};
  try { json = await req.json(); } catch { /* corpo vazio = marcar tudo */ }
  const parsed = Schema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const db = await createAdminClient();
  // Só comunicados do clube do utilizador (a tabela vem isolada por clube)
  let q = db.from("announcements").select("id").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (parsed.data.ids?.length) q = q.in("id", parsed.data.ids);
  const { data } = await q;
  const rows = ((data ?? []) as Array<{ id: string }>).map((r) => ({ announcement_id: r.id, user_id: auth.user.id }));
  if (rows.length > 0) {
    await db.from("announcement_reads").upsert(rows, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
  }
  return NextResponse.json({ ok: true, marked: rows.length });
}
