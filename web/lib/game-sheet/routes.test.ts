import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { fakeSupabase, type Handler, type FakeQuery, type FakeResult } from "./test-utils/fake-supabase";
import { emptySheetData } from "./schema";

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
const runAndStore = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/game-sheet/run", () => ({ runAndStore: (...a: unknown[]) => runAndStore(...(a as [])) }));

const { POST: createImport } = await import("@/app/api/liga/equipa/game-sheet/imports/route");
const { PATCH: patchImport } = await import("@/app/api/liga/equipa/game-sheet/imports/[id]/route");
const { POST: confirmImport } = await import("@/app/api/liga/equipa/game-sheet/imports/[id]/confirm/route");

const USER = "00000000-0000-4000-8000-0000000000d1";
const TEAM = "00000000-0000-4000-8000-0000000000f1";
const GAME = "00000000-0000-4000-8000-0000000000e1";
const IMPORT = "00000000-0000-4000-8000-0000000000a1";
const EVENT_ROW = {
  id: GAME, event_date: "2026-10-20", is_test: false, deleted_at: null,
  description: JSON.stringify({ home_team: "PowerTogether", away_team: "Matosinhos Basket" }),
};

function sheet53() {
  const s = emptySheetData({ home: "PowerTogether", away: "Matosinhos Basket" });
  s.periods = [[21, 15], [11, 11], [15, 12], [6, 17]].map(([h, a], i) => ({ period: i + 1, home: h, away: a }));
  s.final = { home: 53, away: 55 };
  return s;
}

function importRow(over: Record<string, unknown> = {}) {
  return {
    id: IMPORT, event_id: GAME, team_id: TEAM, created_by: USER, status: "ready_to_confirm",
    image_path: `${USER}/2026/${GAME}/abc.jpg`, image_sha256: "abc", schema_version: 1,
    processing_version: "x", model: "m", sheet_data: sheet53(), validation: null, ai_usage: null,
    analysis_count: 1, corrections: [], error: null, submission_id: null, confirmed_at: null,
    created_at: "2026-10-27T10:00:00Z", updated_at: "2026-10-27T10:00:00Z", ...over,
  };
}

/** Handler base: delegado da PowerTogether, jogo dele. */
function baseHandler(extra?: (q: FakeQuery) => FakeResult | undefined, opts: { member?: boolean; teamName?: string } = {}): Handler {
  return (q: FakeQuery) => {
    const r = extra?.(q);
    if (r) return r;
    if (q.table === "league_team_members") {
      return opts.member === false ? { data: null } : { data: { team_id: TEAM, league_teams: { name: opts.teamName ?? "PowerTogether" } } };
    }
    if (q.table === "events") return { data: EVENT_ROW };
    return { data: null };
  };
}

function setup(handler: Handler, user: { id: string } | null = { id: USER }, ligaAdmin = false) {
  current = fakeSupabase({ user, handler, rpc: (n) => (n === "is_liga_admin" ? { data: ligaAdmin } : { data: null }) });
}

async function jpeg() {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: "#eee" } }).jpeg().toBuffer();
}

function uploadReq(body: Buffer, gameId = GAME, type = "image/jpeg") {
  const fd = new FormData();
  fd.append("photo", new File([new Uint8Array(body)], "folha.jpg", { type }));
  fd.append("game_id", gameId);
  return new Request("http://x/api", { method: "POST", body: fd });
}

const params = { params: Promise.resolve({ id: IMPORT }) };

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "k";
  runAndStore.mockClear();
});

describe("13. permissões", () => {
  it("sem sessão → 401", async () => {
    setup(baseHandler(), null);
    expect((await createImport(uploadReq(await jpeg()))).status).toBe(401);
  });

  it("utilizador sem equipa nem admin → 403", async () => {
    setup(baseHandler(undefined, { member: false }));
    expect((await createImport(uploadReq(await jpeg()))).status).toBe(403);
  });

  it("jogo de outra equipa → 404 (não confia no id enviado)", async () => {
    setup(baseHandler(undefined, { teamName: "Outra Equipa" }));
    const res = await createImport(uploadReq(await jpeg()));
    expect(res.status).toBe(404);
    expect(runAndStore).not.toHaveBeenCalled();
  });

  it("delegado não confirma importação de outra equipa", async () => {
    setup(baseHandler((q) => (q.table === "game_sheet_imports" ? { data: importRow({ team_id: "outra" }) } : undefined)));
    expect((await confirmImport(new Request("http://x", { method: "POST", body: "{}" }), params)).status).toBe(404);
  });
});

describe("upload", () => {
  it("rejeita ficheiro que não é imagem, mesmo com Content-Type de imagem", async () => {
    setup(baseHandler());
    const res = await createImport(uploadReq(Buffer.from("<html>malicioso</html>"), GAME, "image/jpeg"));
    expect(res.status).toBe(400);
  });

  it("14. reimportar a mesma imagem devolve o rascunho existente sem nova análise", async () => {
    setup(baseHandler((q) => {
      if (q.table === "game_sheet_imports" && q.op === "select" && q.filters.image_sha256) return { data: { id: IMPORT } };
      if (q.table === "game_sheet_imports" && q.op === "select" && q.filters.id === IMPORT) return { data: importRow() };
      return undefined;
    }));
    const res = await createImport(uploadReq(await jpeg()));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reused).toBe(true);
    expect(runAndStore).not.toHaveBeenCalled();
    expect(current.calls.some((c) => c.table === "game_sheet_imports" && c.op === "insert")).toBe(false);
  });

  it("análise simultânea do mesmo jogo → 409", async () => {
    setup(baseHandler((q) => {
      if (q.table === "game_sheet_imports" && q.op === "insert") return { error: { message: "dup", code: "23505" } };
      if (q.table === "game_sheet_imports" && q.op === "select" && q.head) return { count: 0 };
      return undefined;
    }));
    expect((await createImport(uploadReq(await jpeg()))).status).toBe(409);
  });

  it("cria importação, guarda imagem privada e corre a análise", async () => {
    setup(baseHandler((q) => {
      if (q.table === "game_sheet_imports" && q.op === "insert") return { data: { id: IMPORT } };
      if (q.table === "game_sheet_imports" && q.op === "select" && q.head) return { count: 0 };
      if (q.table === "game_sheet_imports" && q.op === "select" && q.filters.id === IMPORT) return { data: importRow({ status: "needs_review" }) };
      return undefined;
    }));
    const res = await createImport(uploadReq(await jpeg()));
    expect(res.status).toBe(201);
    const ins = current.calls.find((c) => c.table === "game_sheet_imports" && c.op === "insert")!;
    expect(ins.payload).toMatchObject({ event_id: GAME, team_id: TEAM, created_by: USER, status: "processing", image_mime: "image/jpeg" });
    expect(runAndStore).toHaveBeenCalledOnce();
    const json = await res.json();
    expect(json.image_url).toBe("https://signed.example/img");
    expect(json).not.toHaveProperty("extraction_raw");
  });

  it("limite de importações por hora → 429", async () => {
    setup(baseHandler((q) => (q.table === "game_sheet_imports" && q.head ? { count: 99 } : undefined)));
    expect((await createImport(uploadReq(await jpeg()))).status).toBe(429);
  });
});

describe("edição (15/16)", () => {
  it("não permite editar boletim já publicado", async () => {
    setup(baseHandler((q) => (q.table === "game_sheet_imports" ? { data: importRow({ status: "published" }) } : undefined)));
    const res = await patchImport(new Request("http://x", { method: "PATCH", body: JSON.stringify({ sheet: sheet53() }) }), params);
    expect(res.status).toBe(409);
  });

  it("versão desatualizada → 409", async () => {
    setup(baseHandler((q) => (q.table === "game_sheet_imports" ? { data: importRow() } : undefined)));
    const res = await patchImport(new Request("http://x", { method: "PATCH", body: JSON.stringify({ sheet: sheet53(), version: "old" }) }), params);
    expect(res.status).toBe(409);
  });

  it("guarda correção: recalcula no servidor, regista alteração e força as equipas do jogo", async () => {
    let updatePayload: Record<string, unknown> | null = null;
    setup(baseHandler((q) => {
      if (q.table !== "game_sheet_imports") return undefined;
      if (q.op === "update") { updatePayload = q.payload as Record<string, unknown>; return { data: { id: IMPORT } }; }
      return { data: importRow({ status: "confirmed" }) };
    }));
    const edited = sheet53();
    edited.final.home = 54; // passa a ter erro (parciais somam 53)
    edited.teams.home.name = "Equipa Inventada";
    const res = await patchImport(new Request("http://x", { method: "PATCH", body: JSON.stringify({ sheet: edited }) }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).needs_reconfirmation).toBe(true);
    const p = updatePayload!;
    expect(p.status).toBe("needs_review");
    expect((p.sheet_data as { teams: { home: { name: string } } }).teams.home.name).toBe("PowerTogether");
    expect((p.corrections as { changes: string[] }[])[0].changes[0]).toContain("53-55 → 54-55");
  });

  it("dados malformados são rejeitados", async () => {
    setup(baseHandler((q) => (q.table === "game_sheet_imports" ? { data: importRow() } : undefined)));
    const bad = { ...sheet53(), final: { home: -3, away: "x" } };
    const res = await patchImport(new Request("http://x", { method: "PATCH", body: JSON.stringify({ sheet: bad }) }), params);
    expect(res.status).toBe(400);
  });
});

describe("confirmação", () => {
  const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

  it("bloqueia com erros materiais (parciais ≠ final)", async () => {
    const s = sheet53();
    s.final.home = 60;
    setup(baseHandler((q) => (q.table === "game_sheet_imports" ? { data: importRow({ sheet_data: s }) } : undefined)));
    const res = await confirmImport(req({}), params);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("blocking_errors");
  });

  it("avisos exigem reconhecimento explícito", async () => {
    const s = sheet53();
    s.players = [{ id: "p1", side: "home", number: 4, name: "", hoophubPlayerId: null, fouls: 1, played: true, confidence: 0.5 }];
    setup(baseHandler((q) => (q.table === "game_sheet_imports" ? { data: importRow({ sheet_data: s }) } : undefined)));
    const res = await confirmImport(req({}), params);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("needs_acknowledgement");
  });

  it("cria submissão pendente ligada à importação (só pontos confirmados)", async () => {
    let inserted: Record<string, unknown> | null = null;
    setup(baseHandler((q) => {
      if (q.table === "result_submissions" && q.op === "insert") { inserted = q.payload as Record<string, unknown>; return { data: { id: "sub1" } }; }
      if (q.table === "result_submissions") return { data: null };
      if (q.table === "game_sheet_imports" && q.op === "update") return { data: null };
      if (q.table === "game_sheet_imports") return { data: importRow() };
      return undefined;
    }));
    const res = await confirmImport(req({}), params);
    expect(res.status).toBe(200);
    expect(inserted).toMatchObject({ event_id: GAME, home_score: 53, away_score: 55, import_id: IMPORT, status: "pending", submitted_by_user_id: USER });
    const raw = inserted!.extraction_raw as { pontos_por_atribuir: unknown; parciais: unknown[] };
    expect(raw.pontos_por_atribuir).toEqual({ casa: 53, fora: 55 });
    expect(raw.parciais).toHaveLength(4);
    const upd = current.calls.find((c) => c.table === "game_sheet_imports" && c.op === "update")!;
    expect(upd.payload).toMatchObject({ status: "confirmed", submission_id: "sub1" });
  });

  it("submissão pendente de outro delegado → 409", async () => {
    setup(baseHandler((q) => {
      if (q.table === "result_submissions") return { data: { id: "sub0", submitted_by_user_id: "outro" } };
      if (q.table === "game_sheet_imports") return { data: importRow() };
      return undefined;
    }));
    expect((await confirmImport(req({}), params)).status).toBe(409);
  });
});
