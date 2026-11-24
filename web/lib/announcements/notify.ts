import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendToUsers, pushConfigured } from "@/lib/push/member-push";
import { excerpt, targetLabel } from "./format";
import type { AnnouncementTarget } from "./types";

/** Destino da notificação: a página de Comunicados da área do jogador. */
export const ANNOUNCEMENT_URL = "/player/comunicados";

interface UserRow { id: string; role: string; roles_extra: string[] | null; active: boolean }

/** Jogadores ativos do clube (papel principal ou adicional "jogador"), exceto quem publicou. */
export async function playerRecipients(db: SupabaseClient, clubId: string, authorId: string | null): Promise<string[]> {
  const { data: members } = await db.from("club_members").select("user_id").eq("club_id", clubId).eq("active", true);
  const ids = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data } = await db.from("users").select("id, role, roles_extra, active").in("id", ids).eq("active", true);
  return ((data ?? []) as UserRow[])
    .filter((u) => u.id !== authorId && (u.role === "jogador" || (u.roles_extra ?? []).includes("jogador")))
    .map((u) => u.id);
}

/**
 * Notifica os jogadores de um comunicado novo (push). "Melhor esforço": nunca lança — o comunicado já foi
 * publicado. Guarda no próprio comunicado quantos dispositivos receberam, para diagnóstico.
 * Recebe um cliente SEM âmbito de pedido (corre em `after()`, fora do contexto de cookies): o clube é explícito.
 */
export async function notifyNewAnnouncement(
  db: SupabaseClient,
  a: { id: string; clubId: string; title: string; body: string; authorId: string | null; target: AnnouncementTarget | null },
): Promise<void> {
  try {
    if (!pushConfigured()) {
      console.warn("[comunicados] push não configurado (VAPID) — sem notificações");
      return;
    }
    const recipients = await playerRecipients(db, a.clubId, a.authorId);
    const context = a.target ? `${targetLabel(a.target)} — ` : "";
    const report = await sendToUsers(db, recipients, {
      title: a.title,
      body: `${context}${excerpt(a.body, 120)}`,
      url: ANNOUNCEMENT_URL,
      tag: `announcement-${a.id}`,
    });
    await db.from("announcements").update({ push_sent: report.sent, push_at: new Date().toISOString() }).eq("id", a.id);
  } catch (e) {
    console.error("[comunicados] falha ao notificar", e);
  }
}
