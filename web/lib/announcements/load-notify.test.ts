import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/push/member-push", () => ({ sendToUsers: vi.fn(), pushConfigured: () => true }));
import { listHighlighted, countUnread } from "./load";
import { playerRecipients, notifyNewAnnouncement } from "./notify";
import { sendToUsers } from "@/lib/push/member-push";

/** BD falsa: cada `from(tabela)` devolve as linhas dessa tabela; a cadeia de filtros é ignorada. */
function fakeDb(tables: Record<string, unknown[]>, calls: string[] = []) {
  return {
    from(t: string) {
      const b: any = new Proxy({}, {
        get(_x, prop) {
          if (prop === "then") return (res: (v: unknown) => unknown) => res({ data: tables[t] ?? [], error: null });
          return (...a: unknown[]) => { calls.push(`${t}.${String(prop)}(${a.map((x) => JSON.stringify(x)).join(",")})`); return b; };
        },
      });
      return b;
    },
  };
}

const NOW = new Date("2026-11-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const base = { author_id: "a1", event_id: null, training_id: null, event: null, training: null };

describe("listHighlighted", () => {
  it("solto: destaca dentro das 72h e deixa de destacar depois", async () => {
    const db = fakeDb({
      announcements: [
        { ...base, id: "novo", title: "T", body: "B", created_at: hoursAgo(71) },
        { ...base, id: "velho", title: "T", body: "B", created_at: hoursAgo(73) },
      ],
      users: [{ id: "a1", name: "Treinador", role: "treinador" }],
      announcement_reads: [],
    });
    const out = await listHighlighted(db, { userId: "u1", now: NOW });
    expect(out.map((a) => a.id)).toEqual(["novo"]);
    expect(out[0].author?.name).toBe("Treinador");
    expect(out[0].unread).toBe(true);
  });

  it("afeto a jogo: mantém-se até ao fim do jogo, mesmo com mais de 72h; sai depois", async () => {
    const game = (date: string, time: string, extra = {}) => ({ id: "g", title: "Liga", opponent: "Porto", competition: "Liga", event_date: date, event_time: time, deleted_at: null, ...extra });
    const db = (g: object) => fakeDb({
      announcements: [{ ...base, id: "j", event_id: "g", title: "T", body: "B", created_at: hoursAgo(200), event: g }],
      users: [], announcement_reads: [],
    });
    expect((await listHighlighted(db(game("2026-11-27", "21:00:00")), { userId: "u1", now: NOW })).map((a) => a.id)).toEqual(["j"]);
    // jogo de ontem já terminou
    expect(await listHighlighted(db(game("2026-11-23", "21:00:00")), { userId: "u1", now: NOW })).toEqual([]);
    // jogo apagado
    expect(await listHighlighted(db(game("2026-11-27", "21:00:00", { deleted_at: "2026-11-25T00:00:00Z" })), { userId: "u1", now: NOW })).toEqual([]);
  });

  it("afeto a treino: acaba com o treino", async () => {
    const tr = (end: string) => ({ id: "t", date: "2026-11-24", start_time: "20:00:00", end_time: end, type: "tecnica", deleted_at: null });
    const db = (t: object) => fakeDb({
      announcements: [{ ...base, id: "x", training_id: "t", title: "T", body: "B", created_at: hoursAgo(1), training: t }],
      users: [], announcement_reads: [],
    });
    expect((await listHighlighted(db(tr("22:30:00")), { userId: "u1", now: NOW })).length).toBe(1);  // 12:00Z < 22:30
    expect((await listHighlighted(db(tr("11:30:00")), { userId: "u1", now: NOW })).length).toBe(0);  // terminou às 11:30
  });

  it("os próprios comunicados e os já lidos não contam como por ler", async () => {
    const rows = [
      { ...base, id: "meu", author_id: "u1", title: "T", body: "B", created_at: hoursAgo(1) },
      { ...base, id: "lido", title: "T", body: "B", created_at: hoursAgo(2) },
      { ...base, id: "novo", title: "T", body: "B", created_at: hoursAgo(3) },
    ];
    const db = fakeDb({ announcements: rows, users: [], announcement_reads: [{ announcement_id: "lido" }] });
    const out = await listHighlighted(db, { userId: "u1", now: NOW });
    expect(Object.fromEntries(out.map((a) => [a.id, a.unread]))).toEqual({ meu: false, lido: false, novo: true });
    expect(await countUnread(db, "u1", NOW)).toBe(2); // fake ignora filtros: meu+novo contam; o real exclui os próprios
  });
});

describe("notificações aos jogadores", () => {
  const users = [
    { id: "p1", role: "jogador", roles_extra: [], active: true },
    { id: "p2", role: "admin", roles_extra: ["jogador"], active: true },       // admin que também joga
    { id: "t1", role: "treinador", roles_extra: [], active: true },            // staff: não é jogador
    { id: "p3", role: "jogador", roles_extra: [], active: false },             // desativado (a query real já filtra active)
    { id: "me", role: "jogador", roles_extra: [], active: true },              // autor
  ];

  it("só jogadores ativos, sem o autor", async () => {
    const db = fakeDb({ club_members: [{ user_id: "p1" }, { user_id: "p2" }, { user_id: "t1" }, { user_id: "me" }], users: users.filter((u) => u.active) });
    expect(await playerRecipients(db as never, "club1", "me")).toEqual(["p1", "p2"]);
  });

  it("sem membros não consulta utilizadores", async () => {
    expect(await playerRecipients(fakeDb({ club_members: [] }) as never, "club1", null)).toEqual([]);
  });

  it("envia título, contexto do jogo e link para a área do jogador; guarda quantos receberam", async () => {
    vi.mocked(sendToUsers).mockResolvedValueOnce({ devices: 3, sent: 3, removed: 0, failed: 0 });
    const calls: string[] = [];
    const db = fakeDb({ club_members: [{ user_id: "p1" }], users: [users[0]] }, calls);
    await notifyNewAnnouncement(db as never, {
      id: "ann1", clubId: "club1", title: "Camisola preta", body: "Levar a camisola preta\npara o jogo", authorId: "me",
      target: { kind: "game", id: "g", title: "Liga", opponent: "Porto", competition: "Liga", date: "2026-11-28", time: "21:00", ends_at: "" },
    });
    const [ids, msg] = vi.mocked(sendToUsers).mock.calls.at(-1)!.slice(1) as [string[], { title: string; body: string; url: string; tag: string }];
    expect(ids).toEqual(["p1"]);
    expect(msg.title).toBe("Camisola preta");
    expect(msg.body).toMatch(/^Jogo · vs Porto · .*28.* · 21:00 — Levar a camisola preta para o jogo$/);
    expect(msg.url).toBe("/player/comunicados");
    expect(msg.tag).toBe("announcement-ann1");
    expect(calls.some((c) => c.startsWith("announcements.update(") && c.includes('"push_sent":3'))).toBe(true);
  });

  it("falha no envio nunca rebenta (o comunicado já está publicado)", async () => {
    vi.mocked(sendToUsers).mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ club_members: [{ user_id: "p1" }], users: [users[0]] });
    await expect(notifyNewAnnouncement(db as never, { id: "a", clubId: "c", title: "t", body: "b", authorId: null, target: null })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
