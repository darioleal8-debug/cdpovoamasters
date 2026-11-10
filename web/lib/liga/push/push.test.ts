import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicGame } from "@/types/competitions";
import { planKickoffs, planResults, planRounds, dispatchPlanned, type PlannedPush } from "./dispatch";
import { parseSubscription } from "./subscription";
import { buildLigaServiceWorker } from "../pwa-sw";

const game = (o: Partial<PublicGame>): PublicGame => ({
  id: "g1", event_date: "2026-11-18", event_time: "20:45:00", location: "Pav. Eça de Queirós", home_team: "CD Póvoa", away_team: "BC Barcelos",
  jornada: 4, volta: 1, syntheticJornada: 4, result: null, result_status: "no_result", pending_count: 0, live_game_url: null, is_our_game: true, is_test: false, ...o,
} as PublicGame);

describe("notificação 15 minutos antes do jogo", () => {
  const at = (iso: string) => new Date(iso);
  it("dispara na janela dos 15 minutos (fuso de Lisboa)", () => {
    expect(planKickoffs([game({})], at("2026-11-18T20:31:00Z"))).toHaveLength(1);
    expect(planKickoffs([game({})], at("2026-11-18T20:30:00Z"))).toHaveLength(1);
    const [p] = planKickoffs([game({})], at("2026-11-18T20:30:30Z"));
    expect(p.message.title).toBe("Jogo em 15 minutos");
    expect(p.message.body).toBe("CD Póvoa vs BC Barcelos · 20:45 · Pav. Eça de Queirós");
  });
  it("não dispara cedo demais, depois do início, com resultado, em testes ou sem hora", () => {
    expect(planKickoffs([game({})], at("2026-11-18T20:20:00Z"))).toHaveLength(0);
    expect(planKickoffs([game({})], at("2026-11-18T20:46:00Z"))).toHaveLength(0);
    expect(planKickoffs([game({ result: { home_score: 1, away_score: 0 } })], at("2026-11-18T20:35:00Z"))).toHaveLength(0);
    expect(planKickoffs([game({ is_test: true })], at("2026-11-18T20:35:00Z"))).toHaveLength(0);
    expect(planKickoffs([game({ event_time: null })], at("2026-11-18T20:35:00Z"))).toHaveLength(0);
  });
  it("respeita o horário de verão (UTC+1)", () => {
    const g = game({ event_date: "2026-07-15" });
    expect(planKickoffs([g], at("2026-07-15T19:31:00Z"))).toHaveLength(1); // 20:31 Lisboa
    expect(planKickoffs([g], at("2026-07-15T20:31:00Z"))).toHaveLength(0);
  });
});

describe("notificação de resultado com notícia", () => {
  const now = new Date("2026-11-18T22:30:00Z");
  const done = game({ result: { home_score: 49, away_score: 23 } });
  const news = { game_id: "g1", slug: "liga-inatel-povoa-barcelos-2026-11-18", title: "Póvoa vence em casa", updated_at: "2026-11-18T22:20:00Z" };
  it("resultado + notícia publicada → notificação com link da notícia", () => {
    const [p] = planResults([done], [news], now);
    expect(p.key).toBe("result:g1");
    expect(p.message.title).toBe("CD Póvoa 49–23 BC Barcelos");
    expect(p.message.body).toBe("Póvoa vence em casa");
    expect(p.message.url).toBe("/liga-inatel/noticias/liga-inatel-povoa-barcelos-2026-11-18");
  });
  it("sem resultado, em teste ou notícia antiga → nada", () => {
    expect(planResults([game({})], [news], now)).toHaveLength(0);
    expect(planResults([{ ...done, is_test: true }], [news], now)).toHaveLength(0);
    expect(planResults([done], [{ ...news, updated_at: "2026-11-17T08:00:00Z" }], now)).toHaveLength(0);
  });
});

describe("notificação de jornada concluída", () => {
  const now = new Date("2026-11-18T22:30:00Z");
  const r = { home_score: 40, away_score: 30 };
  const j4 = [game({ id: "a", result: r }), game({ id: "b", result: r })];
  const recent = new Map([["a", "2026-11-18T22:00:00Z"], ["b", "2026-11-18T22:10:00Z"]]);
  it("todos os jogos com resultado → jornada concluída", () => {
    const [p] = planRounds(j4, recent, now);
    expect(p.key).toBe("round:4");
    expect(p.message.title).toBe("Jornada 4 concluída");
  });
  it("faltando um resultado, jornada antiga ou só jogos de teste → nada", () => {
    expect(planRounds([...j4, game({ id: "c" })], recent, now)).toHaveLength(0);
    expect(planRounds(j4, new Map([["a", "2026-11-01T00:00:00Z"], ["b", "2026-11-01T00:00:00Z"]]), now)).toHaveLength(0);
    expect(planRounds([game({ id: "t", result: r, is_test: true })], new Map([["t", "2026-11-18T22:00:00Z"]]), now)).toHaveLength(0);
    expect(planRounds([game({ id: "x", syntheticJornada: 0, result: r })], new Map([["x", "2026-11-18T22:00:00Z"]]), now)).toHaveLength(0);
  });
});

function fakeLogDb() {
  const keys = new Set<string>();
  const db = {
    from: () => ({
      upsert: (row: { key: string }) => ({
        select: async () => { if (keys.has(row.key)) return { data: [], error: null }; keys.add(row.key); return { data: [{ key: row.key }], error: null }; },
      }),
      update: () => ({ eq: async () => ({}) }),
      delete: () => ({ eq: async (_c: string, k: string) => { keys.delete(k); return {}; } }),
    }),
  } as unknown as SupabaseClient;
  return { db, keys };
}
const planned: PlannedPush = { key: "kickoff:g1:2026-11-18T20:45", kind: "kickoff", ttl: 600, message: { title: "t", body: "b", url: "/liga-inatel", tag: "k" } };

describe("envio idempotente", () => {
  it("só envia uma vez por chave", async () => {
    const { db } = fakeLogDb();
    let calls = 0;
    const send = async () => { calls++; return { sent: 3, removed: 0, failed: 0 }; };
    const a = await dispatchPlanned(db, send, [planned]);
    const b = await dispatchPlanned(db, send, [planned]);
    expect(calls).toBe(1);
    expect(a.sent).toEqual([planned.key]);
    expect(b.skipped).toBe(1);
  });
  it("falha global liberta a chave para nova tentativa", async () => {
    const { db, keys } = fakeLogDb();
    const bad = await dispatchPlanned(db, async () => { throw new Error("VAPID não configurado"); }, [planned]);
    expect(bad.errors[0]).toContain("VAPID");
    expect(keys.size).toBe(0);
    const ok = await dispatchPlanned(db, async () => ({ sent: 1, removed: 0, failed: 0 }), [planned]);
    expect(ok.sent).toHaveLength(1);
  });
});

describe("subscrição push", () => {
  const good = { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNc-_abc123", auth: "xyz_-123" } } };
  it("aceita serviços push conhecidos", () => {
    expect(parseSubscription(good).ok).toBe(true);
    expect(parseSubscription({ subscription: { ...good.subscription, endpoint: "https://web.push.apple.com/Qabc" } }).ok).toBe(true);
    expect(parseSubscription({ subscription: { ...good.subscription, endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc" } }).ok).toBe(true);
  });
  it("recusa endpoints arbitrários (SSRF), http e chaves inválidas", () => {
    expect(parseSubscription({ subscription: { ...good.subscription, endpoint: "https://evil.example.com/x" } }).ok).toBe(false);
    expect(parseSubscription({ subscription: { ...good.subscription, endpoint: "https://fcm.googleapis.com.evil.com/x" } }).ok).toBe(false);
    expect(parseSubscription({ subscription: { ...good.subscription, endpoint: "http://fcm.googleapis.com/x" } }).ok).toBe(false);
    expect(parseSubscription({ subscription: { ...good.subscription, keys: { p256dh: "<script>", auth: "a" } } }).ok).toBe(false);
    expect(parseSubscription(null).ok).toBe(false);
  });
});

describe("service worker", () => {
  it("trata push e clique na notificação", () => {
    const sw = buildLigaServiceWorker("t");
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(() => new Function(sw)).not.toThrow();
  });
});
