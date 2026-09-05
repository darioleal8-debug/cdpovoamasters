import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// POST /api/club-settings/photo-template/assets
// body: FormData { file: File, type: "background" | "logo" }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const admin = await createAdminClient();

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return fail("Sem permissão", 403);

  let fd: FormData;
  try { fd = await req.formData(); }
  catch { return fail("Formulário inválido"); }

  const file = fd.get("file") as File | null;
  const type = (fd.get("type") as string | null) ?? "background";

  if (!file || file.size === 0) return fail("Ficheiro não recebido");
  if (file.size > 5 * 1024 * 1024) return fail("Ficheiro demasiado grande (máx. 5 MB)");

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"];
  if (!allowed.includes(file.type)) return fail("Tipo de ficheiro não suportado");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `club-settings/${type}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage
    .from("player-photos")
    .upload(path, buf, { contentType: file.type, upsert: true });

  if (error) return fail(error.message, 500);

  const { data: { publicUrl } } = admin.storage
    .from("player-photos")
    .getPublicUrl(path);

  return NextResponse.json({ url: publicUrl });
}
