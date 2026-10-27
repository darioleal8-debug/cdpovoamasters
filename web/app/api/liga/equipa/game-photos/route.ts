import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorizeLeagueDelegate } from "@/lib/auth/liga-delegate-guard";

const BUCKET = "game-photos";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// POST /api/liga/equipa/game-photos
// Upload uma fotografia de jogo. Autenticação + membro da equipa obrigatório.
export async function POST(req: Request) {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "FormData inválido" }, { status: 400 });

  const photo    = form.get("photo")     as File   | null;
  const gameId   = form.get("game_id")   as string | null;
  const caption  = ((form.get("caption") as string | null) ?? "").slice(0, 120).trim() || null;

  if (!photo || !gameId) {
    return NextResponse.json({ error: "photo e game_id são obrigatórios" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(photo.type)) {
    return NextResponse.json({ error: "Tipo não suportado. Usa JPEG, PNG ou WEBP." }, { status: 400 });
  }

  if (photo.size > MAX_BYTES) {
    return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 10 MB)" }, { status: 400 });
  }

  const admin = await createAdminClient();

  // Equipa do delegado (da associação, não do formulário)
  const team = { id: auth.teamId };

  // Check result not yet approved
  const { data: result } = await admin
    .from("league_game_results")
    .select("id")
    .eq("event_id", gameId)
    .maybeSingle();
  if (result) {
    return NextResponse.json({ error: "Resultado já aprovado — não é possível adicionar fotos" }, { status: 409 });
  }

  // Check count (trigger also enforces, but fail fast here)
  const { count } = await admin
    .from("game_photos")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .eq("team_id", team.id);
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "Limite de 3 fotografias por equipa atingido" }, { status: 409 });
  }

  // Upload to storage
  const ext = photo.type === "image/webp" ? "webp" : photo.type === "image/png" ? "png" : "jpg";
  const storagePath = `${gameId}/${team.id}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await photo.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: photo.type, upsert: false, cacheControl: "31536000" });

  if (uploadErr) {
    console.error(`[game-photos] upload: ${uploadErr.message}`);
    return NextResponse.json({ error: "Erro no upload" }, { status: 500 });
  }

  // Insert DB row
  const { data: inserted, error: dbErr } = await admin
    .from("game_photos")
    .insert({ game_id: gameId, team_id: team.id, storage_path: storagePath, caption, uploaded_by: user.id })
    .select("id")
    .single();

  if (dbErr) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    console.error(`[game-photos] insert: ${dbErr.message}`);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
  return NextResponse.json({ id: inserted.id, public_url: pub.publicUrl, storage_path: storagePath });
}
