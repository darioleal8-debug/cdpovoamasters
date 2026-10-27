import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { fakeSupabase, type FakeQuery, type FakeResult } from "./test-utils/fake-supabase";
import { emptySheetData } from "./schema";

let isAdmin = true;
let userClient: ReturnType<typeof fakeSupabase>;
let adminClient: ReturnType<typeof fakeSupabase>;
let serviceClient: ReturnType<typeof fakeSupabase>;
const ADMIN = "00000000-0000-4000-8000-00000000000a";
const GAME = "00000000-0000-4000-8000-0000000000e1";
const IMP = "00000000-0000-4000-8000-0000000000a1";
const SUB = "00000000-0000-4000-8000-0000000000b1";

vi.mock("@/lib/auth/liga-admin-guard", () => ({
  authorizeAsLigaAdmin: async () =>
    isAdmin
      ? { ok: true, user: { id: ADMIN }, supabase: userClient.client }
      : { ok: false, response: NextResponse.json({ error: "Sem permissão de admin da liga" }, { status: 403 }) },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => userClient.client,
  createAdminClient: async () => adminClient.client,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => serviceClient.client,
}));
const runAndStore = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/game-sheet/run", () => ({
  runAndStore: (...a: unknown[]) => runAndStore(...(a as [])),
  reanalyzeImport: vi.fn(async () => ({ ok: true })),
}));
const generateLigaNews = vi.fn(async () => ({ ok: false, error: "x" }));
vi.mock("@/lib/liga/generate-news", () => ({ generateLigaNews: () => generateLigaNews() }));
vi.mock("@/lib/liga/generate-image", () => ({ generateNewsImage: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { void fn(); } }));

const sheetsRoute = await import("@/app/api/liga/admin/games/[eventId]/sheets/route");
const analyzeRoute = await import("@/app/api/liga/admin/games/[eventId]/sheets/analyze/route");
const applyRoute = await import("@/app/api/liga/admin/game-sheets/[importId]/apply/route");

const EVENT = (date = "2026-10-20") => ({
  id: GAME, event_date: date, is_test: false, deleted_at: null,
  description: JSON.stringify({ home_team: "PowerTogether", away_team: "Matosinhos Basket" }),
});

function sheet53() {
  const s = emptySheetData({ home: "PowerTogether", away: "Matosinhos Basket" });
  s.periods = [[21, 15], [11, 11], [15, 12], [6, 17]].map(([h, a], i) => ({ period: i + 1, home: h, away: a }));
  s.final = { home: 53, away: 55 };
  return s;
}
const importRow = (over: Record<string, unknown> = {}) => ({
  id: IMP, event_id: GAME, team_id: null, created_by: ADMIN, status: "ready_to_confirm",
  image_path: `admin/${GAME}/abc.jpg`, image_sha256: "abc", schema_version: 1, processing_version: "x", model: "m",
  sheet_data: sheet53(), extraction_raw: {}, validation: null, ai_usage: null, analysis_count: 1, corrections: [],
  error: null, submission_id: null, confirmed_at: null, source_submission_id: null,
  created_at: "2026-10-27T10:00:00Z", updated_at: "2026-10-27T10:00:00Z", ...over,
});

function setup(
  handler: (q: FakeQuery) => FakeResult | undefined,
  opts: { eventDate?: string; adminHandler?: (q: FakeQuery) => FakeResult | undefined; download?: Buffer } = {},
) {
  userClient = fakeSupabase({
    user: { id: ADMIN },
    handler: (q) => handler(q) ?? (q.table === "events" ? { data: EVENT(opts.eventDate) } : { data: null }),
    rpc: (name) => (name === "liga_apply_game_sheet" ? { data: { ok: true } } : { data: true }),
  });
  adminClient = fakeSupabase({
    user: null,
    handler: (q) => opts.adminHandler?.(q) ?? { data: null },
    storage: { download: () => ({ data: opts.download ? new Blob([new Uint8Array(opts.download)]) : null }) },
  });
  serviceClient = fakeSupabase({ user: null, handler: () => ({ data: null }) });
}

const p = <T extends Record<string, string>>(o: T) => ({ params: Promise.resolve(o) });
async function jpeg() {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: "#eee" } }).jpeg().toBuffer();
}
function upload(buf: Buffer) {
  const fd = new FormData();
  fd.append("photo", new File([new Uint8Array(buf)], "f.jpg", { type: "image/jpeg" }));
  return new Request("http://x", { method: "POST", body: fd });
}

beforeEach(() => {
  isAdmin = true;
  process.env.DEEPSEEK_API_KEY = "k";
  runAndStore.mockClear();
  generateLigaNews.mockClear();
});

describe("GET folhas do jogo", () => {
  it("só admin da liga", async () => {
    isAdmin = false;
    setup(() => undefined);
    expect((await sheetsRoute.GET(new Request("http://x"), p({ eventId: GAME }))).status).toBe(403);
  });

  it("junta submissões por analisar e importações, sem duplicar, e marca a melhor", async () => {
    setup(
      (q) => {
        if (q.table === "game_sheet_imports") {
          return {
            data: [
              importRow({ id: "i-bom" }),
              importRow({ id: "i-mau", image_path: "u/2026/g/del.jpg", team_id: "t1", sheet_data: { ...sheet53(), final: { home: 60, away: 55 } } }),
            ],
          };
        }
        return undefined;
      },
      {
        adminHandler: (q) =>
          q.table === "result_submissions"
            ? { data: [
                { id: "s-dup", photo_url: "u/2026/g/del.jpg", submitted_by_team: "PowerTogether", submitted_at: "2026-10-20T22:00:00Z" },
                { id: "s-nova", photo_url: "u/2026/g/outra.jpg", submitted_by_team: "Matosinhos", submitted_at: "2026-10-20T23:00:00Z" },
                { id: "s-pdf", photo_url: "u/2026/g/folha.pdf", submitted_by_team: "Matosinhos", submitted_at: "2026-10-21T09:00:00Z" },
              ] }
            : undefined,
      },
    );
    const res = await sheetsRoute.GET(new Request("http://x"), p({ eventId: GAME }));
    const json = await res.json();
    expect(res.status).toBe(200);
    const keys = json.candidates.map((c: { key: string }) => c.key);
    expect(keys).toEqual(["imp:i-bom", "imp:i-mau", "sub:s-nova", "sub:s-pdf"]); // s-dup já está importada
    expect(json.best_key).toBe("imp:i-bom"); // a outra tem erro (parciais ≠ final)
    expect(json.candidates.find((c: { key: string }) => c.key === "sub:s-pdf").status).toBe("nao_suportado");
    expect(json.finished).toBe(true);
  });
});

describe("POST carregar folha melhorada", () => {
  it("recusa jogos ainda não realizados", async () => {
    setup(() => undefined, { eventDate: "2099-01-01" });
    expect((await sheetsRoute.POST(upload(await jpeg()), p({ eventId: GAME }))).status).toBe(409);
  });

  it("recusa ficheiros que não são imagem", async () => {
    setup(() => undefined);
    expect((await sheetsRoute.POST(upload(Buffer.from("<html>x</html>")), p({ eventId: GAME }))).status).toBe(400);
  });

  it("cria importação do admin (sem equipa), guarda no bucket privado e analisa", async () => {
    setup((q) => (q.table === "game_sheet_imports" && q.op === "insert" ? { data: { id: IMP } } : undefined));
    const res = await sheetsRoute.POST(upload(await jpeg()), p({ eventId: GAME }));
    expect(res.status).toBe(201);
    const ins = userClient.calls.find((c) => c.table === "game_sheet_imports" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({ event_id: GAME, team_id: null, created_by: ADMIN, status: "processing" });
    expect((ins.payload as { image_path: string }).image_path).toMatch(new RegExp(`^admin/${GAME}/[0-9a-f]{64}\\.jpg$`));
    expect(runAndStore).toHaveBeenCalledOnce();
  });
});

describe("POST analisar uma folha submetida", () => {
  it("PDF não é analisável", async () => {
    setup(() => undefined, { adminHandler: (q) => (q.table === "result_submissions" ? { data: { id: SUB, event_id: GAME, photo_url: "u/a.pdf" } } : undefined) });
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "submission", id: SUB }) });
    expect((await analyzeRoute.POST(req, p({ eventId: GAME }))).status).toBe(415);
  });

  it("reutiliza o ficheiro da submissão e liga a importação à submissão", async () => {
    setup(
      (q) => (q.table === "game_sheet_imports" && q.op === "insert" ? { data: { id: IMP } } : undefined),
      { adminHandler: (q) => (q.table === "result_submissions" ? { data: { id: SUB, event_id: GAME, photo_url: "u/2026/g/del.jpg" } } : undefined), download: await jpeg() },
    );
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "submission", id: SUB }) });
    const res = await analyzeRoute.POST(req, p({ eventId: GAME }));
    expect(res.status).toBe(200);
    const ins = userClient.calls.find((c) => c.table === "game_sheet_imports" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({ image_path: "u/2026/g/del.jpg", source_submission_id: SUB, team_id: null });
    expect(runAndStore).toHaveBeenCalledOnce();
  });

  it("pedido inválido → 400", async () => {
    setup(() => undefined);
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "x", id: "1" }) });
    expect((await analyzeRoute.POST(req, p({ eventId: GAME }))).status).toBe(400);
  });
});

describe("POST aplicar ao jogo", () => {
  const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

  it("motivo obrigatório", async () => {
    setup(() => undefined);
    expect((await applyRoute.POST(req({}), p({ importId: IMP }))).status).toBe(400);
  });

  it("bloqueia boletim com erros", async () => {
    setup((q) => (q.table === "game_sheet_imports" ? { data: importRow({ sheet_data: { ...sheet53(), final: { home: 99, away: 55 } } }) } : undefined));
    const res = await applyRoute.POST(req({ motivo: "folha melhorada" }), p({ importId: IMP }));
    expect(res.status).toBe(422);
  });

  it("submissão pendente de outro boletim → 409", async () => {
    setup((q) => {
      if (q.table === "game_sheet_imports") return { data: importRow() };
      if (q.table === "result_submissions" && q.op === "select") return { data: { id: "outra", import_id: "outro-boletim" } };
      return undefined;
    });
    expect((await applyRoute.POST(req({ motivo: "x" }), p({ importId: IMP }))).status).toBe(409);
  });

  it("cria submissão do admin e aplica numa transação (RPC); regenera a notícia se pedido", async () => {
    let rpcArgs: unknown = null;
    setup((q) => {
      if (q.table === "game_sheet_imports" && q.op === "select") return { data: importRow() };
      if (q.table === "result_submissions" && q.op === "insert") return { data: { id: "sub-admin" } };
      return undefined;
    });
    const origRpc = userClient.client.rpc;
    userClient.client.rpc = async (name: string, args: unknown) => { rpcArgs = { name, args }; return origRpc(name, args); };
    const res = await applyRoute.POST(req({ motivo: "folha mais legível", regenerate_news: true }), p({ importId: IMP }));
    expect(res.status).toBe(200);
    const ins = userClient.calls.find((c) => c.table === "result_submissions" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({ event_id: GAME, home_score: 53, away_score: 55, import_id: IMP, status: "pending", submitted_by_name: "Admin da liga", notes: "folha mais legível" });
    expect(rpcArgs).toMatchObject({ name: "liga_apply_game_sheet", args: { p_submission_id: "sub-admin", p_motivo: "folha mais legível" } });
    expect((rpcArgs as { args: { p_payload: { periods: unknown[] } } }).args.p_payload.periods).toHaveLength(4);
    expect(generateLigaNews).toHaveBeenCalledOnce();
  });
});

describe("POST carregar folha (regressão Parte 1 — upload antes do insert)", () => {
  it("reutiliza linha 'failed' com mesmo hash: update em vez de insert", async () => {
    setup((q) => {
      if (q.table === "game_sheet_imports" && q.op === "select") return { data: { id: IMP, status: "failed" } };
      if (q.table === "game_sheet_imports" && q.op === "update") return { data: null };
      return undefined;
    });
    const res = await sheetsRoute.POST(upload(await jpeg()), p({ eventId: GAME }));
    expect(res.status).toBe(201);
    const inserts = userClient.calls.filter((c) => c.table === "game_sheet_imports" && c.op === "insert");
    expect(inserts).toHaveLength(0);
    const updates = userClient.calls.filter((c) => c.table === "game_sheet_imports" && c.op === "update");
    expect(updates.some((u) => (u.payload as Record<string, unknown>)?.status === "processing")).toBe(true);
    expect(runAndStore).toHaveBeenCalledOnce();
  });

  it("ignora linha existente com status != failed e devolve skipped=true", async () => {
    setup((q) => {
      if (q.table === "game_sheet_imports" && q.op === "select") return { data: { id: IMP, status: "ready_to_confirm" } };
      return undefined;
    });
    const res = await sheetsRoute.POST(upload(await jpeg()), p({ eventId: GAME }));
    expect(res.status).toBe(200); // skipped → 200
    expect(runAndStore).not.toHaveBeenCalled();
  });
});

describe("DELETE apagar folha", () => {
  const delReq = (body: unknown) => new Request("http://x", { method: "DELETE", body: JSON.stringify(body) });

  it("non-admin → 403", async () => {
    isAdmin = false;
    setup(() => undefined);
    expect((await sheetsRoute.DELETE(delReq({ kind: "import", id: IMP }), p({ eventId: GAME }))).status).toBe(403);
  });

  it("kind inválido → 400", async () => {
    setup(() => undefined);
    expect((await sheetsRoute.DELETE(delReq({ kind: "other", id: IMP }), p({ eventId: GAME }))).status).toBe(400);
  });

  it("id inválido → 400", async () => {
    setup(() => undefined);
    expect((await sheetsRoute.DELETE(delReq({ kind: "import", id: "not-a-uuid" }), p({ eventId: GAME }))).status).toBe(400);
  });

  it("apaga importação e remove objeto do Storage quando can_remove=true", async () => {
    const removedPaths: string[] = [];
    userClient = fakeSupabase({
      user: { id: ADMIN },
      handler: (q) => (q.table === "events" ? { data: EVENT() } : { data: null }),
      rpc: (name) => name === "liga_delete_game_sheet"
        ? { data: { storage_path: `admin/${GAME}/abc.jpg`, can_remove: true } }
        : { data: null },
    });
    serviceClient = fakeSupabase({
      user: null,
      handler: () => ({ data: [] }),
      storage: { remove: (paths) => { removedPaths.push(...paths); return {}; } },
    });
    adminClient = fakeSupabase({ user: null, handler: () => ({ data: null }) });

    const res = await sheetsRoute.DELETE(delReq({ kind: "import", id: IMP, reason: "imagem errada" }), p({ eventId: GAME }));
    expect(res.status).toBe(200);
    expect(removedPaths).toContain(`admin/${GAME}/abc.jpg`);
  });

  it("apaga importação com can_remove=false — não remove Storage", async () => {
    let storageCalled = false;
    userClient = fakeSupabase({
      user: { id: ADMIN },
      handler: (q) => (q.table === "events" ? { data: EVENT() } : { data: null }),
      rpc: () => ({ data: { storage_path: `admin/${GAME}/abc.jpg`, can_remove: false } }),
    });
    serviceClient = fakeSupabase({
      user: null,
      handler: () => ({ data: [] }),
      storage: { remove: () => { storageCalled = true; return {}; } },
    });
    adminClient = fakeSupabase({ user: null, handler: () => ({ data: null }) });

    const res = await sheetsRoute.DELETE(delReq({ kind: "import", id: IMP }), p({ eventId: GAME }));
    expect(res.status).toBe(200);
    expect(storageCalled).toBe(false);
  });

  it("importação em processamento → 409 via código RPC 55000", async () => {
    userClient = fakeSupabase({
      user: { id: ADMIN },
      handler: (q) => (q.table === "events" ? { data: EVENT() } : { data: null }),
      rpc: () => ({ error: { message: "Importação em processamento", code: "55000" } }),
    });
    serviceClient = fakeSupabase({ user: null, handler: () => ({ data: null }) });
    adminClient = fakeSupabase({ user: null, handler: () => ({ data: null }) });

    expect((await sheetsRoute.DELETE(delReq({ kind: "import", id: IMP }), p({ eventId: GAME }))).status).toBe(409);
  });

  it("apaga kind=submission: anula photo_url via RPC e remove Storage se sem refs", async () => {
    const removedPaths: string[] = [];
    userClient = fakeSupabase({
      user: { id: ADMIN },
      handler: (q) => (q.table === "events" ? { data: EVENT() } : { data: null }),
      rpc: () => ({ data: { storage_path: null, can_remove: false } }),
    });
    serviceClient = fakeSupabase({
      user: null,
      handler: (q) => {
        if (q.table === "result_submissions") return { data: { id: SUB, event_id: GAME, photo_url: "u/2026/g/del.jpg" } };
        if (q.table === "game_sheet_imports") return { data: [] }; // sem refs
        return { data: null };
      },
      storage: { remove: (paths) => { removedPaths.push(...paths); return {}; } },
    });
    adminClient = fakeSupabase({ user: null, handler: () => ({ data: null }) });

    const res = await sheetsRoute.DELETE(delReq({ kind: "submission", id: SUB }), p({ eventId: GAME }));
    expect(res.status).toBe(200);
    expect(removedPaths).toContain("u/2026/g/del.jpg");
  });

  it("apaga kind=submission: mantém Storage se outra importação usa o mesmo path", async () => {
    let storageCalled = false;
    userClient = fakeSupabase({
      user: { id: ADMIN },
      handler: (q) => (q.table === "events" ? { data: EVENT() } : { data: null }),
      rpc: () => ({ data: { storage_path: null, can_remove: false } }),
    });
    serviceClient = fakeSupabase({
      user: null,
      handler: (q) => {
        if (q.table === "result_submissions") return { data: { id: SUB, event_id: GAME, photo_url: "u/2026/g/del.jpg" } };
        if (q.table === "game_sheet_imports") return { data: [{ id: IMP }] }; // outra importação usa este path
        return { data: null };
      },
      storage: { remove: () => { storageCalled = true; return {}; } },
    });
    adminClient = fakeSupabase({ user: null, handler: () => ({ data: null }) });

    const res = await sheetsRoute.DELETE(delReq({ kind: "submission", id: SUB }), p({ eventId: GAME }));
    expect(res.status).toBe(200);
    expect(storageCalled).toBe(false);
  });
});
