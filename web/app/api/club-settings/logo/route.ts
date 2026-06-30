import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── POST /api/club-settings/logo ───────────────────────
export async function POST(req: NextRequest) {
  // Autenticação via cookie
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Cliente admin para storage (bypass RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Formulário inválido" }, { status: 400 }); }

  const file = formData.get("logo") as File | null;
  if (!file) return NextResponse.json({ error: "Ficheiro não recebido" }, { status: 400 });

  // Validações
  const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 2 MB)" }, { status: 400 });
  }
  const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Formato não suportado (PNG, JPG, SVG, WEBP)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `club_default.${ext}`;

  // Upload para Supabase Storage (substitui automaticamente ficheiro anterior)
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("club-logos")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true, // substitui se já existir
      cacheControl: "3600",
    });

  if (uploadErr) {
    console.error("[club-settings/logo] upload error:", uploadErr);
    return NextResponse.json(
      { error: `Erro no upload: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  // URL pública (sem expiração — bucket público)
  const { data: urlData } = admin.storage
    .from("club-logos")
    .getPublicUrl(path);

  // Cache-bust: adicionar timestamp para forçar reload no browser
  const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  // Atualizar DB
  const extraFields: Record<string, string> = { logo_url: logoUrl, updated_at: new Date().toISOString() };

  const primaryColor = formData.get("primary_color") as string | null;
  const secondaryColor = formData.get("secondary_color") as string | null;
  if (primaryColor)   extraFields.primary_color   = primaryColor;
  if (secondaryColor) extraFields.secondary_color  = secondaryColor;

  const { error: dbErr } = await admin
    .from("club_settings")
    .update(extraFields)
    .eq("id", "default");

  if (dbErr) {
    console.error("[club-settings/logo] db error:", dbErr);
    return NextResponse.json({ error: `Erro na base de dados: ${dbErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ logo_url: logoUrl, primary_color: primaryColor, secondary_color: secondaryColor });
}

// ─── DELETE /api/club-settings/logo ──────────────────────
export async function DELETE() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Remove todos os ficheiros do clube (qualquer extensão)
  const { data: files } = await admin.storage.from("club-logos").list();
  const clubFiles = (files ?? []).filter((f) => f.name.startsWith("club_default"));
  if (clubFiles.length > 0) {
    await admin.storage.from("club-logos").remove(clubFiles.map((f) => f.name));
  }

  await admin.from("club_settings").update({ logo_url: null, updated_at: new Date().toISOString() }).eq("id", "default");

  return NextResponse.json({ logo_url: null });
}
