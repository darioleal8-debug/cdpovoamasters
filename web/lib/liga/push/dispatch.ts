/**
 * Notificações da Liga INATEL. Corre de minuto a minuto (pg_cron → /api/cron/liga-push) e é
 * idempotente: cada evento é "reclamado" em liga_push_log antes do envio, por isso nunca repete.
 *
 *  1. kickoff — 15 minutos antes de cada jogo
 *  2. result  — resultado aprovado COM notícia publicada (link para a notícia)
 *  3. round   — jornada com todos os resultados aprovados
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicGame } from "@/types/competitions";
import { clubDateTimeToInstant } from "@/lib/time/club-time";
import type { PushMessage, Sender } from "./send";

export const KICKOFF_LEAD_MIN = 15;
/** Só notifica resultados/jornadas recentes — evita enxurrada ao ligar a funcionalidade ou após falha longa. */
export const RECENT_MS = 12 * 60 * 60 * 1000;

export interface PlannedPush {
  key: string;
  kind: "kickoff" | "result" | "round";
  message: PushMessage;
  ttl: number;
}

const hhmm = (t: string) => t.slice(0, 5);

export function planKickoffs(games: PublicGame[], now: Date): PlannedPush[] {
  const out: PlannedPush[] = [];
  for (const g of games) {
    if (g.is_test || !g.event_time || g.result) continue;
    const start = clubDateTimeToInstant(g.event_date, g.event_time);
    if (!start) continue;
    const mins = (start.getTime() - now.getTime()) / 60000;
    if (mins <= 0 || mins > KICKOFF_LEAD_MIN) continue;
    out.push({
      key: `kickoff:${g.id}:${g.event_date}T${hhmm(g.event_time)}`,
      kind: "kickoff",
      ttl: 600,
      message: {
        title: `Jogo em ${KICKOFF_LEAD_MIN} minutos`,
        body: `${g.home_team} vs ${g.away_team} · ${hhmm(g.event_time)}${g.location ? ` · ${g.location}` : ""}`,
        url: "/liga-inatel/calendario",
        tag: `kickoff-${g.id}`,
      },
    });
  }
  return out;
}

export interface PublishedNews { game_id: string; slug: string; title: string; updated_at: string }

export function planResults(games: PublicGame[], news: PublishedNews[], now: Date): PlannedPush[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const out: PlannedPush[] = [];
  for (const n of news) {
    const g = byId.get(n.game_id);
    if (!g || g.is_test || !g.result) continue;
    if (now.getTime() - new Date(n.updated_at).getTime() > RECENT_MS) continue;
    out.push({
      key: `result:${g.id}`,
      kind: "result",
      ttl: 6 * 3600,
      message: {
        title: `${g.home_team} ${g.result.home_score}–${g.result.away_score} ${g.away_team}`,
        body: n.title,
        url: `/liga-inatel/noticias/${n.slug}`,
        tag: `result-${g.id}`,
      },
    });
  }
  return out;
}

export function planRounds(games: PublicGame[], lastApprovalByEvent: Map<string, string>, now: Date): PlannedPush[] {
  const rounds = new Map<number, PublicGame[]>();
  for (const g of games) {
    if (g.is_test || !(g.syntheticJornada > 0)) continue;
    (rounds.get(g.syntheticJornada) ?? rounds.set(g.syntheticJornada, []).get(g.syntheticJornada)!).push(g);
  }
  const out: PlannedPush[] = [];
  for (const [j, list] of rounds) {
    if (!list.every((g) => g.result)) continue;
    const latest = Math.max(...list.map((g) => new Date(lastApprovalByEvent.get(g.id) ?? 0).getTime()));
    if (!latest || now.getTime() - latest > RECENT_MS) continue;
    out.push({
      key: `round:${j}`,
      kind: "round",
      ttl: 6 * 3600,
      message: {
        title: `Jornada ${j} concluída`,
        body: `Já estão disponíveis os ${list.length} resultados da jornada ${j}.`,
        url: "/liga-inatel/resultados",
        tag: `round-${j}`,
      },
    });
  }
  return out;
}

export interface DispatchReport { planned: number; sent: PlannedPush["key"][]; skipped: number; errors: string[] }

/** Reclama a chave (insert único); só quem a reclama envia. */
async function claim(db: SupabaseClient, p: PlannedPush): Promise<boolean> {
  const { data, error } = await db.from("liga_push_log")
    .upsert({ key: p.key, kind: p.kind, title: p.message.title, body: p.message.body, url: p.message.url }, { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function dispatchPlanned(db: SupabaseClient, send: Sender, planned: PlannedPush[]): Promise<DispatchReport> {
  const report: DispatchReport = { planned: planned.length, sent: [], skipped: 0, errors: [] };
  for (const p of planned) {
    try {
      if (!(await claim(db, p))) { report.skipped++; continue; }
      try {
        const r = await send(p.message, p.ttl);
        await db.from("liga_push_log").update({ sent: r.sent, removed: r.removed }).eq("key", p.key);
        report.sent.push(p.key);
      } catch (e) {
        // falha global (ex.: VAPID em falta): liberta a chave para nova tentativa
        await db.from("liga_push_log").delete().eq("key", p.key);
        throw e;
      }
    } catch (e) {
      report.errors.push(`${p.key}: ${(e as Error).message}`);
    }
  }
  return report;
}

/** Lê o estado da liga e dispara o que for devido. */
export async function runLigaPushes(db: SupabaseClient, send: Sender, games: PublicGame[], now = new Date()): Promise<DispatchReport> {
  const { data: newsRows } = await db.from("news")
    .select("game_id, slug, title, updated_at")
    .eq("category", "Liga INATEL").eq("is_published", true).not("game_id", "is", null)
    .gte("updated_at", new Date(now.getTime() - RECENT_MS).toISOString());
  const { data: approvals } = await db.from("league_game_results")
    .select("event_id, approved_at").not("approved_at", "is", null)
    .gte("approved_at", new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString());
  const lastApproval = new Map((approvals ?? []).map((r) => [r.event_id as string, r.approved_at as string]));

  const planned = [
    ...planKickoffs(games, now),
    ...planResults(games, (newsRows ?? []) as PublishedNews[], now),
    ...planRounds(games, lastApproval, now),
  ];
  if (!planned.length) return { planned: 0, sent: [], skipped: 0, errors: [] };
  return dispatchPlanned(db, send, planned);
}
