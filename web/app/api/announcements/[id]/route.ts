import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/guards";
import { ANNOUNCERS, hasAnyRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/server";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from "@/lib/announcements/types";

export const runtime = "nodejs";

const IdSchema = z.string().uuid();
type Authed = Exclude<Awaited<ReturnType<typeof authorize>>, { ok: false }>;

/** Administradores gerem qualquer comunicado; o treinador só os que publicou. Devolve a BD ou a resposta de erro. */
async function ownedBy(auth: Authed, id: string) {
  if (!IdSchema.safeParse(id).success) return { error: NextResponse.json({ error: "Id inválido" }, { status: 400 }) } as const;
  const db = await createAdminClient();
  const { data: row } = await db.from("announcements").select("id, author_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!row) return { error: NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 }) } as const;
  if (!hasAnyRole(auth.profile, ["admin"]) && row.author_id !== auth.user.id) {
    return { error: NextResponse.json({ error: "Só podes alterar os teus comunicados" }, { status: 403 }) } as const;
  }
  return { db } as const;
}

// ─── PATCH /api/announcements/[id] — corrigir título/texto (não volta a notificar) ──
const PatchSchema = z.object({
  title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX).optional(),
  body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX).optional(),
}).refine((v) => v.title !== undefined || v.body !== undefined, { message: "Nada para alterar" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(ANNOUNCERS);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await ownedBy(auth, id);
  if ("error" in r) return r.error;

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });

  const { error } = await r.db.from("announcements").update(parsed.data).eq("id", id);
  if (error) return NextResponse.json({ error: "Não foi possível guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/announcements/[id] — retira o comunicado (fica guardado, sem aparecer a ninguém) ──
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(ANNOUNCERS);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await ownedBy(auth, id);
  if ("error" in r) return r.error;

  const { error } = await r.db.from("announcements").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "Não foi possível apagar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
