import "server-only";
import * as webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushMessage { title: string; body: string; url: string; tag: string }
export interface PushReport { devices: number; sent: number; removed: number; failed: number }

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

let configured = false;
/** Mesmas chaves VAPID da app da Liga (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). */
export function pushConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:cdpmasters@gmail.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

/** Envia a notificação a todos os dispositivos dos utilizadores indicados; remove as subscrições expiradas (404/410). */
export async function sendToUsers(
  db: SupabaseClient,
  userIds: string[],
  msg: PushMessage,
  ttlSeconds = 24 * 3600,
): Promise<PushReport> {
  const report: PushReport = { devices: 0, sent: 0, removed: 0, failed: 0 };
  if (userIds.length === 0) return report;
  if (!pushConfigured()) throw new Error("VAPID não configurado");

  const subs: SubRow[] = [];
  for (let i = 0; i < userIds.length; i += 100) {
    const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds.slice(i, i + 100));
    subs.push(...((data ?? []) as SubRow[]));
  }
  report.devices = subs.length;

  const payload = JSON.stringify(msg);
  const topic = msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined;
  const dead: string[] = [];
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(subs.slice(i, i + 25).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: ttlSeconds, urgency: "high", topic });
        report.sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { dead.push(s.id); report.removed++; } else report.failed++;
      }
    }));
  }
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return report;
}
