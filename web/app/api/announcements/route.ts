import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/guards";
import { ANNOUNCERS, hasAnyRole } from "@/lib/auth/roles";
import { clubIdForUser } from "@/lib/auth/club";
import { createAdminClient, createUnscopedAdminClient } from "@/lib/supabase/server";
import { listAnnouncements } from "@/lib/announcements/load";
import { listUpcomingGames, listUpcomingTrainings } from "@/lib/announcements/targets";
import { gameEndsAt, trainingEndsAt } from "@/lib/announcements/expiry";
import { notifyNewAnnouncement } from "@/lib/announcements/notify";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, type AnnouncementTarget } from "@/lib/announcements/types";

export const runtime = "nodejs";

// ─── GET /api/announcements?limit=&before= ───────────────────────────────────
// Qualquer membro ativo do clube lê; `can_post` diz se vê o formulário de publicação.
export async function GET(req: NextRequest) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const limit = Number(sp.get("limit") ?? 30);
  const before = sp.get("before");
  if (before && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "Cursor inválido" }, { status: 400 });
  }

  const db = await createAdminClient();
  const { announcements, hasMore } = await listAnnouncements(db, {
    userId: auth.user.id,
    limit: Number.isFinite(limit) ? limit : 30,
    before,
  });
  return NextResponse.json({
    announcements,
    has_more: hasMore,
    can_post: hasAnyRole(auth.profile, ANNOUNCERS),
    is_admin: hasAnyRole(auth.profile, ["admin"]),
    // Jogadores recebem as notificações push: só a eles se oferece ativá-las
    is_player: hasAnyRole(auth.profile, ["jogador"]),
    me: auth.user.id,
  });
}

// ─── POST /api/announcements ─────────────────────────────────────────────────
// Só administradores e treinador. Corpo: { title, body, target?: { type: "game"|"training", id } }.
const PostSchema = z.object({
  title: z.string().trim().min(1, "Escreve um título").max(ANNOUNCEMENT_TITLE_MAX, `Título com no máximo ${ANNOUNCEMENT_TITLE_MAX} caracteres`),
  body: z.string().trim().min(1, "Escreve a mensagem").max(ANNOUNCEMENT_BODY_MAX, `Mensagem com no máximo ${ANNOUNCEMENT_BODY_MAX} caracteres`),
  target: z.object({ type: z.enum(["game", "training"]), id: z.string().uuid() }).nullish(),
});

export async function POST(req: NextRequest) {
  const auth = await authorize(ANNOUNCERS);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { title, body, target: want } = parsed.data;

  const db = await createAdminClient();
  const clubId = await clubIdForUser(db, auth.user.id);
  if (!clubId) return NextResponse.json({ error: "Sem clube ativo" }, { status: 403 });

  // Jogo/treino afeto: tem de ser do clube e ainda não ter terminado
  let eventId: string | null = null;
  let trainingId: string | null = null;
  let target: AnnouncementTarget | null = null;
  const now = new Date();

  if (want?.type === "game") {
    const game = (await listUpcomingGames(db, clubId, now)).find((g) => g.id === want.id);
    if (!game) return NextResponse.json({ error: "Jogo não encontrado ou já terminado" }, { status: 400 });
    eventId = game.id;
    target = {
      kind: "game", id: game.id, title: game.title, opponent: game.opponent, competition: game.competition,
      date: game.event_date, time: game.event_time ? game.event_time.slice(0, 5) : null,
      ends_at: gameEndsAt(game.event_date, game.event_time).toISOString(),
    };
  } else if (want?.type === "training") {
    const training = (await listUpcomingTrainings(db, now)).find((t) => t.id === want.id);
    if (!training) return NextResponse.json({ error: "Treino não encontrado ou já terminado" }, { status: 400 });
    trainingId = training.id;
    target = {
      kind: "training", id: training.id, date: training.date,
      time: training.start_time ? training.start_time.slice(0, 5) : null, training_type: training.type,
      ends_at: trainingEndsAt(training).toISOString(),
    };
  }

  const { data: created, error } = await db
    .from("announcements")
    .insert({ club_id: clubId, author_id: auth.user.id, title, body, event_id: eventId, training_id: trainingId })
    .select("id, created_at")
    .single();
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "Não foi possível publicar" }, { status: 500 });
  }

  // Notificação aos jogadores depois de responder (o comunicado já está publicado). Cliente sem âmbito de
  // pedido: dentro de after() já não há cookies; o clube vai explícito.
  after(async () => {
    await notifyNewAnnouncement(await createUnscopedAdminClient(), {
      id: created.id, clubId, title, body, authorId: auth.user.id, target,
    });
  });

  return NextResponse.json({ id: created.id, created_at: created.created_at }, { status: 201 });
}
