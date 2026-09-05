import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";

// POST /api/trainings/[id]/attendance/auto
// Body JSON: { photo: "data:image/jpeg;base64,..." }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: trainingId } = await params;
  const adminClient = await createAdminClient();

  // Jogador deve ter registo na temporada ativa
  const { data: player } = await adminClient
    .from("players")
    .select("id, season_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!player) {
    return NextResponse.json(
      { error: "Sem perfil de jogador associado. Contacta o teu treinador." },
      { status: 404 }
    );
  }

  // Buscar treino
  const { data: training } = await adminClient
    .from("trainings")
    .select("id, date, season_id")
    .eq("id", trainingId)
    .single();

  if (!training) {
    return NextResponse.json({ error: "Treino não encontrado." }, { status: 404 });
  }

  // Validar que o treino é HOJE
  const today = new Date().toISOString().slice(0, 10);
  if (training.date !== today) {
    return NextResponse.json(
      { error: "A auto-presença por fotografia só está disponível no dia do treino." },
      { status: 400 }
    );
  }

  // Jogador deve pertencer à mesma temporada do treino
  if (player.season_id !== training.season_id) {
    return NextResponse.json(
      { error: "Não pertences à temporada deste treino." },
      { status: 403 }
    );
  }

  // Verificar se já tem presença registada
  const { data: existing } = await adminClient
    .from("training_attendance")
    .select("id, status")
    .eq("training_id", trainingId)
    .eq("player_id", player.id)
    .maybeSingle();

  if (existing && existing.status === "present") {
    return NextResponse.json(
      { error: "Presença já registada para este treino." },
      { status: 409 }
    );
  }

  // Parsear body JSON
  let body: { photo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const photoDataUrl = body.photo;
  if (!photoDataUrl || !photoDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Fotografia obrigatória." }, { status: 400 });
  }

  // Converter data URL para Buffer
  const base64Data = photoDataUrl.split(",")[1];
  if (!base64Data) {
    return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 400 });
  }
  const photoBuffer = Buffer.from(base64Data, "base64");
  const photoHash = crypto.createHash("sha256").update(photoBuffer).digest("hex");

  // Anti-fraude: mesma foto usada por outro jogador neste treino
  const { data: duplicateHash } = await adminClient
    .from("training_attendance")
    .select("id, player_id")
    .eq("training_id", trainingId)
    .eq("photo_hash", photoHash)
    .neq("player_id", player.id)
    .maybeSingle();

  if (duplicateHash) {
    return NextResponse.json(
      { error: "Esta fotografia já foi utilizada por outro jogador neste treino." },
      { status: 409 }
    );
  }

  // Garantir que o bucket existe
  try {
    const { data: buckets } = await adminClient.storage.listBuckets();
    if (!buckets?.some((b) => b.name === "attendance-photos")) {
      await adminClient.storage.createBucket("attendance-photos", {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });
    }
  } catch {
    // bucket pode já existir — continuar
  }

  // Upload da foto
  const contentType = photoDataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  const ext = contentType === "image/png" ? "png" : "jpg";
  const storagePath = `${trainingId}/${player.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await adminClient.storage
    .from("attendance-photos")
    .upload(storagePath, photoBuffer, { contentType, upsert: false });

  if (uploadError) {
    console.error("[auto-attendance] Upload error:", uploadError.message);
    return NextResponse.json({ error: "Erro ao guardar fotografia." }, { status: 500 });
  }

  const { data: { publicUrl } } = adminClient.storage
    .from("attendance-photos")
    .getPublicUrl(storagePath);

  // Upsert presença — status "present" diretamente, method "photo"
  const now = new Date().toISOString();
  const { data: attendance, error: upsertError } = await adminClient
    .from("training_attendance")
    .upsert(
      {
        training_id:    trainingId,
        player_id:      player.id,
        status:         "present",
        method:         "photo",
        photo_url:      publicUrl,
        auto_timestamp: now,
        photo_hash:     photoHash,
        updated_at:     now,
        updated_by:     user.id,
      },
      { onConflict: "training_id,player_id" }
    )
    .select()
    .single();

  if (upsertError) {
    console.error("[auto-attendance] Upsert error:", upsertError.message);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Inserir registo em training_photos (upsert — uma foto por jogador/treino)
  await adminClient
    .from("training_photos")
    .upsert(
      { training_id: trainingId, player_id: player.id, photo_url: publicUrl, timestamp: now },
      { onConflict: "training_id,player_id" }
    );

  console.log(`[auto-attendance] player=${player.id} training=${trainingId} status=present method=photo`);

  return NextResponse.json({ attendance, photo_url: publicUrl });
}
