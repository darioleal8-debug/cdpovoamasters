import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorizeLeagueDelegate } from "@/lib/auth/liga-delegate-guard";
import {
  GAME_PHOTOS_BUCKET,
  MAX_PHOTOS_PER_TEAM,
  getGameTeams,
  storeGamePhoto,
  syncNewsCover,
} from "@/lib/liga/game-photos";

async function assertTeamInGame(admin: Awaited<ReturnType<typeof createAdminClient>>, gameId: string, teamId: string) {
  const teams = await getGameTeams(admin, gameId);
  if (!teams) return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  if (teams.homeId !== teamId && teams.awayId !== teamId) {
    return NextResponse.json({ error: "A tua equipa não participa neste jogo" }, { status: 403 });
  }
  return null;
}

// GET /api/liga/equipa/game-photos?game_id=…
// Fotos que a equipa do delegado já carregou neste jogo.
export async function GET(req: Request) {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;

  const gameId = new URL(req.url).searchParams.get("game_id");
  if (!gameId) return NextResponse.json({ error: "game_id obrigatório" }, { status: 400 });

  const admin = await createAdminClient();
  const denied = await assertTeamInGame(admin, gameId, auth.teamId);
  if (denied) return denied;

  const { data } = await admin
    .from("game_photos")
    .select("id, storage_path, caption, hidden, uploaded_by, created_at")
    .eq("game_id", gameId)
    .eq("team_id", auth.teamId)
    .order("created_at", { ascending: true });

  const photos = (data ?? []).map((p) => ({
    id: p.id,
    caption: p.caption,
    hidden: p.hidden,
    can_delete: p.uploaded_by === auth.user.id,
    public_url: admin.storage.from(GAME_PHOTOS_BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
  }));

  return NextResponse.json({ photos, max: MAX_PHOTOS_PER_TEAM });
}

// POST /api/liga/equipa/game-photos
// Upload de uma fotografia de jogo pelo delegado de uma das equipas.
// Permitido a qualquer momento — antes ou depois de o resultado estar confirmado.
export async function POST(req: Request) {
  const auth = await authorizeLeagueDelegate();
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "FormData inválido" }, { status: 400 });

  const photo   = form.get("photo")   as File   | null;
  const gameId  = form.get("game_id") as string | null;
  const caption = ((form.get("caption") as string | null) ?? "").slice(0, 120).trim() || null;

  if (!photo || !gameId) {
    return NextResponse.json({ error: "photo e game_id são obrigatórios" }, { status: 400 });
  }

  const admin = await createAdminClient();
  const denied = await assertTeamInGame(admin, gameId, auth.teamId);
  if (denied) return denied;

  // Equipa sempre da associação do delegado, nunca do formulário
  const stored = await storeGamePhoto(admin, { gameId, teamId: auth.teamId, photo, caption, userId: auth.user.id });
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });

  // Se o jogo já tem notícia sem foto real, esta passa a ser a capa
  await syncNewsCover(admin, gameId, { kind: "added" });

  return NextResponse.json({ id: stored.id, public_url: stored.public_url, storage_path: stored.storage_path });
}
