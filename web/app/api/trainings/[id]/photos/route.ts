import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const BUCKET = "event-photos";

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ── GET /api/trainings/[id]/photos ────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: trainingId } = await params;
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const db = adminClient();
  const { data, error } = await db
    .from("event_photos")
    .select("id, entity_type, entity_id, user_id, uploader_name, photo_url, created_at")
    .eq("entity_type", "training")
    .eq("entity_id", trainingId)
    .order("created_at", { ascending: true });

  if (error) return fail(error.message, 500);
  return NextResponse.json({ photos: data ?? [] });
}

// ── POST /api/trainings/[id]/photos ───────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: trainingId } = await params;
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const db = adminClient();

  // Validar que o treino existe
  const { data: training } = await db
    .from("trainings")
    .select("id")
    .eq("id", trainingId)
    .single();
  if (!training) return fail("Treino não encontrado", 404);

  // Obter nome do utilizador
  const { data: profile } = await db
    .from("users")
    .select("name")
    .eq("id", authUser.id)
    .single();

  // Receber imagem (multipart)
  let imageBlob: Blob;
  try {
    const fd = await req.formData();
    const file = fd.get("photo") as File | null;
    if (!file) return fail("Campo 'photo' em falta");
    if (!file.type.startsWith("image/")) return fail("O ficheiro deve ser uma imagem");
    if (file.size > 10 * 1024 * 1024) return fail("Ficheiro demasiado grande (máx 10 MB)");
    imageBlob = file;
  } catch {
    return fail("Erro ao processar o ficheiro");
  }

  // Criar bucket se não existir (idempotente)
  await db.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  // Upload para Storage
  const ext  = "jpg";
  const path = `training/${trainingId}/${crypto.randomUUID()}.${ext}`;
  const arrayBuffer = await imageBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: false });

  if (uploadErr) return fail(`Erro no upload: ${uploadErr.message}`, 500);

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);

  // Inserir registo na BD
  const { data: photo, error: dbErr } = await db
    .from("event_photos")
    .insert({
      entity_type:   "training",
      entity_id:     trainingId,
      user_id:       authUser.id,
      uploader_name: profile?.name ?? null,
      photo_url:     publicUrl,
    })
    .select()
    .single();

  if (dbErr) {
    // Limpar storage se a BD falhou
    await db.storage.from(BUCKET).remove([path]);
    return fail(`Erro ao guardar: ${dbErr.message}`, 500);
  }

  return NextResponse.json({ photo }, { status: 201 });
}

// ── DELETE /api/trainings/[id]/photos ─────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // consumed
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { searchParams } = new URL(req.url);
  const photoId = searchParams.get("photoId");
  if (!photoId) return fail("photoId é obrigatório");

  const db = adminClient();

  // Verificar permissão
  const { data: photo } = await db
    .from("event_photos")
    .select("id, user_id, photo_url")
    .eq("id", photoId)
    .single();
  if (!photo) return fail("Foto não encontrada", 404);

  const { data: caller } = await db
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (photo.user_id !== authUser.id && caller?.role !== "admin") {
    return fail("Sem permissão para apagar esta foto", 403);
  }

  // Apagar do Storage
  try {
    const url = new URL(photo.photo_url);
    const parts = url.pathname.split(`/object/public/${BUCKET}/`);
    if (parts[1]) {
      await db.storage.from(BUCKET).remove([parts[1]]);
    }
  } catch { /* storage cleanup best-effort */ }

  await db.from("event_photos").delete().eq("id", photoId);
  return NextResponse.json({ success: true });
}
