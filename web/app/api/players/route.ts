import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const runtime = "nodejs";

// ─── Auth: obtém utilizador autenticado ──────────────────
async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── Admin client (para Storage — bypassa RLS) ───────────
function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no .env.local");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

// ─── Helpers ──────────────────────────────────────────────
function fail(msg: string, status = 400) {
  console.error("[api/players]", msg);
  return NextResponse.json({ success: false, error: msg }, { status });
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uploadPhoto(
  admin: ReturnType<typeof adminClient>,
  photo: File,
  storagePath: string
): Promise<string | null> {
  if (!photo || photo.size === 0) return null;

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(photo.type)) {
    console.warn("[api/players] Invalid photo type:", photo.type);
    return null;
  }

  const buf = Buffer.from(await photo.arrayBuffer());
  const ext = (photo.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${storagePath}.${ext}`;

  const { error } = await admin.storage
    .from("player-photos")
    .upload(path, buf, { contentType: photo.type, upsert: true });

  if (error) {
    console.warn("[api/players] Storage upload failed:", error.message);
    return null;
  }

  const { data: { publicUrl } } = admin.storage
    .from("player-photos")
    .getPublicUrl(path);

  return publicUrl;
}

// ─── POST /api/players ─── Criar jogador ─────────────────
export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado — faz login antes de continuar", 401);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return fail("Não foi possível ler o formulário");
  }

  // Campos obrigatórios
  const name      = (fd.get("name")      as string | null)?.trim() ?? "";
  const seasonId  = (fd.get("season_id") as string | null)?.trim() ?? "";

  // Campos opcionais
  const teamId    = (fd.get("team_id")       as string | null)?.trim() || null;
  const numberRaw = (fd.get("number")        as string | null)?.trim();
  const position  = (fd.get("position")      as string | null)?.trim() || null;
  const heightRaw = (fd.get("height")        as string | null)?.trim();
  const ageRaw    = (fd.get("age")           as string | null)?.trim();
  const photo     = fd.get("photo") as File | null;

  if (!name)     return fail("O nome do jogador é obrigatório");
  if (!seasonId) return fail("Seleciona uma temporada");

  if (numberRaw && (isNaN(Number(numberRaw)) || Number(numberRaw) < 0 || Number(numberRaw) > 99))
    return fail("Número de camisola inválido (0–99)");
  if (heightRaw && (isNaN(Number(heightRaw)) || Number(heightRaw) < 100 || Number(heightRaw) > 260))
    return fail("Altura inválida (100–260 cm)");
  if (ageRaw && (isNaN(Number(ageRaw)) || Number(ageRaw) < 10 || Number(ageRaw) > 100))
    return fail("Idade inválida (10–100)");

  console.log("[api/players] POST", { name, seasonId, position, numberRaw });

  // Duplicate check via constraint (UNIQUE name + season_id)
  // Pré-verificação para dar mensagem clara antes de tentar inserir
  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (e) {
    return fail((e as Error).message, 500);
  }

  const { data: dup } = await admin
    .from("players")
    .select("id")
    .eq("season_id", seasonId)
    .ilike("name", name)
    .maybeSingle();

  if (dup) {
    return fail(`Já existe um jogador com o nome "${name}" nesta temporada`, 409);
  }

  // Upload da foto (opcional — não bloqueia criação se falhar)
  const photoUrl = photo && photo.size > 0
    ? await uploadPhoto(admin, photo, `${seasonId}/${Date.now()}-${slugify(name)}`)
    : null;

  // Inserir na tabela players
  const { data: player, error } = await admin
    .from("players")
    .insert({
      season_id:  seasonId,
      team_id:    teamId,
      name,
      number:     numberRaw ? Number(numberRaw) : null,
      position:   position  || null,
      height:     heightRaw ? Number(heightRaw) : null,
      age:        ageRaw    ? Number(ageRaw)    : null,
      photo_url:  photoUrl,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/players] Insert error:", error);
    return fail(`Erro ao criar jogador: ${error.message}`, 500);
  }

  console.log("[api/players] Created:", player.id, player.name);
  return NextResponse.json({ success: true, player }, { status: 201 });
}

// ─── PATCH /api/players ─── Atualizar foto ───────────────
export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return fail("Não foi possível ler o formulário");
  }

  const playerId = (fd.get("player_id") as string | null)?.trim() ?? "";
  const photo    = fd.get("photo") as File | null;

  if (!playerId)              return fail("player_id é obrigatório");
  if (!photo || photo.size === 0) return NextResponse.json({ success: true, message: "Sem foto para atualizar" });

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (e) {
    return fail((e as Error).message, 500);
  }

  // Confirmar que o jogador existe
  const { data: existing } = await admin
    .from("players")
    .select("id, season_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!existing) return fail("Jogador não encontrado", 404);

  const photoUrl = await uploadPhoto(
    admin,
    photo,
    `${existing.season_id}/${playerId}`
  );

  if (!photoUrl) return fail("Erro ao fazer upload da foto — verifica se o bucket 'player-photos' existe", 500);

  const { error } = await admin
    .from("players")
    .update({ photo_url: photoUrl })
    .eq("id", playerId);

  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true, photo_url: photoUrl });
}

// ─── DELETE /api/players ─── Remover jogador ─────────────
export async function DELETE(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return fail("Não autenticado", 401);

  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get("id")?.trim() ?? "";
  if (!playerId) return fail("id é obrigatório");

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (e) {
    return fail((e as Error).message, 500);
  }

  const { error } = await admin
    .from("players")
    .delete()
    .eq("id", playerId);

  if (error) return fail(error.message, 500);

  return NextResponse.json({ success: true });
}
