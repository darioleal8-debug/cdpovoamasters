import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock("./server", () => ({ createClient: async () => ({}) }));
import { replay, NO_CLUB } from "./club-scope";

function fake() {
  const calls: string[] = [];
  const b: any = new Proxy({}, { get: (_t, p) => (...a: unknown[]) => { calls.push(`${String(p)}(${JSON.stringify(a)})`); return b; } });
  return { client: { from: (t: string) => { calls.push(`from(${t})`); return b; } }, calls };
}
const scope = { clubId: "C1" };

describe("club-scope replay", () => {
  it("select/update/delete filtram por club_id", () => {
    for (const m of ["select", "update", "delete"]) {
      const f = fake();
      replay(f.client, "players", [[m, []], ["eq", ["id", 1]]], scope, null);
      expect(f.calls).toContain('eq(["club_id","C1"])');
    }
  });
  it("insert/upsert forçam o club_id do pedido (objeto e lista)", () => {
    const f = fake();
    replay(f.client, "documents", [["insert", [{ title: "x", club_id: "OUTRO" }]]], scope, null);
    expect(f.calls.join()).toContain('"club_id":"C1"');
    expect(f.calls.join()).not.toContain("OUTRO");
    const g = fake();
    replay(g.client, "plays", [["upsert", [[{ a: 1 }, { a: 2 }]]]], scope, null);
    expect(g.calls.join()).toContain('[{"a":1,"club_id":"C1"},{"a":2,"club_id":"C1"}]');
  });
  it("select depois de insert não leva filtro extra", () => {
    const f = fake();
    replay(f.client, "players", [["insert", [{}]], ["select", []]], scope, null);
    expect(f.calls.filter((c) => c.startsWith("eq("))).toEqual([]);
  });
  it("events inclui jogos da Liga (club_id nulo) e não injeta no insert", () => {
    const f = fake();
    replay(f.client, "events", [["update", [{ a: 1 }]]], scope, null);
    expect(f.calls.join()).toContain("club_id.is.null");
    const g = fake();
    replay(g.client, "events", [["insert", [{ a: 1 }]]], scope, null);
    expect(g.calls.join()).not.toContain("club_id");
  });
  it("users filtra pelos membros do clube; sem membros nada passa", () => {
    const f = fake();
    replay(f.client, "users", [["select", []]], scope, ["u1", "u2"]);
    expect(f.calls).toContain('in(["id",["u1","u2"]])');
    const g = fake();
    replay(g.client, "users", [["update", [{}]]], scope, []);
    expect(g.calls).toContain(`in(["id",["${NO_CLUB}"]])`);
  });
  it("sem âmbito (cron/público) e tabelas não isoladas ficam inalteradas", () => {
    const f = fake();
    replay(f.client, "players", [["select", []]], null, null);
    replay(f.client, "club_settings", [["select", []]], scope, null);
    expect(f.calls.filter((c) => c.startsWith("eq(") || c.startsWith("in(") || c.startsWith("or("))).toEqual([]);
  });
});
