import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "club-logos";
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

// PATCH /api/liga/equipa/logo
// O delegado de equipa actualiza o logo da sua equipa
export async function PATCH(req: Request) {
  const supabase = await createClient();

  // 1. Validar sessão
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // 2. Obter team_id (RLS: p1_ltm_select_self permite SELECT própria linha)
  const { data: membership } = await supabase
    .from("league_team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Sem acesso de equipa" }, { status: 403 });
  }

  // 3. Ler o ficheiro do multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const file = formData.get("logo") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Ficheiro 'logo' não encontrado" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de ficheiro não permitido (use JPEG, PNG, WebP ou SVG)" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 2 MB)" }, { status: 400 });
  }

  // 4. Upload para o bucket (RLS: team_member_upload/update_league_logo)
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `league/${membership.team_id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const logoUrl = publicData.publicUrl;

  // 5. Actualizar league_teams.logo_url (RLS: team_member_update_logo)
  const { error: updateErr } = await supabase
    .from("league_teams")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", membership.team_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, logo_url: logoUrl });
}
