import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { PhotoTemplateConfig } from "@/lib/photo-composite";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// GET /api/club-settings/photo-template
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("club_settings")
    .select("photo_template")
    .eq("id", "default")
    .single();

  if (error) return fail(error.message, 500);

  return NextResponse.json({ template: data?.photo_template ?? null });
}

// PUT /api/club-settings/photo-template
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  const admin = await createAdminClient();

  // Verificar permissão de admin
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return fail("Sem permissão", 403);

  const body = await req.json() as PhotoTemplateConfig;
  if (!body || typeof body !== "object") return fail("Configuração inválida");

  // Buscar versão actual para incrementar
  const { data: current } = await admin
    .from("club_settings")
    .select("photo_template")
    .eq("id", "default")
    .single();

  const currentVersion = (current?.photo_template as PhotoTemplateConfig | null)?.version ?? 0;
  const newVersion = currentVersion + 1;
  const newTemplate = { ...body, version: newVersion };

  // Guardar na club_settings
  const { error: updateErr } = await admin
    .from("club_settings")
    .update({ photo_template: newTemplate, updated_at: new Date().toISOString() })
    .eq("id", "default");

  if (updateErr) return fail(updateErr.message, 500);

  // Guardar histórico de versões
  await admin
    .from("player_photo_templates")
    .insert({ version: newVersion, config: newTemplate });

  return NextResponse.json({ template: newTemplate, version: newVersion });
}
