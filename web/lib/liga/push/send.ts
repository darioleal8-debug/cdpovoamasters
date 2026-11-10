import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PushMessage { title: string; body: string; url: string; tag: string }
export interface SendReport { sent: number; removed: number; failed: number }
export type Sender = (msg: PushMessage, ttlSeconds: number) => Promise<SendReport>;

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:cdpmasters@gmail.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

/** Envia a mensagem a todas as subscrições; remove as expiradas (404/410). */
export function makeSender(db: SupabaseClient): Sender {
  return async (msg, ttl) => {
    if (!configure()) throw new Error("VAPID não configurado");
    const { data } = await db.from("liga_push_subscriptions").select("id, endpoint, p256dh, auth");
    const subs = (data ?? []) as SubRow[];
    const payload = JSON.stringify(msg);
    const report: SendReport = { sent: 0, removed: 0, failed: 0 };
    const dead: string[] = [];
    for (let i = 0; i < subs.length; i += 25) {
      await Promise.all(subs.slice(i, i + 25).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: ttl, urgency: "high", topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined });
          report.sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) { dead.push(s.id); report.removed++; } else report.failed++;
        }
      }));
    }
    if (dead.length) await db.from("liga_push_subscriptions").delete().in("id", dead);
    return report;
  };
}
