import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveSheetLocation } from "@/lib/liga/sheet-location";

export const runtime = "nodejs";

const SIGNED_URL_TTL = 10 * 60; // 10 minutos

// GET /api/liga/admin/submissions/[id]/sheet
// Abre a folha de jogo submetida (bucket privado) através de um URL assinado de curta duração.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Submissão inválida" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data: sub } = await admin
    .from("result_submissions")
    .select("photo_url")
    .eq("id", id)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "Submissão não encontrada" }, { status: 404 });

  const loc = resolveSheetLocation(sub.photo_url as string | null);
  if (!loc) return NextResponse.json({ error: "Esta submissão não tem folha de jogo" }, { status: 404 });

  const { data, error } = await admin.storage.from(loc.bucket).createSignedUrl(loc.path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Folha de jogo indisponível no armazenamento" }, { status: 404 });
  }

  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
