import { describe, it, expect, vi, beforeEach } from "vitest";

const authorize = vi.fn();
const loadImport = vi.fn();
vi.mock("@/lib/game-sheet/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/game-sheet/service")>()),
  authorizeGameSheet: (...a: unknown[]) => authorize(...a),
  loadImport: (...a: unknown[]) => loadImport(...a),
  loadGameForAccess: async () => ({ id: "g1", date: "2026-11-24", home: "A", away: "B", isTest: false }),
  importView: async () => ({ ok: true }),
}));
const reanalyzeImport = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/game-sheet/run", () => ({ reanalyzeImport: (...a: unknown[]) => reanalyzeImport(...(a as [])) }));
vi.mock("@/lib/match-docs/run", () => ({ convertToProStatsIfNeeded: async () => null, reanalyzeProStats: vi.fn() }));

const { POST } = await import("@/app/api/liga/equipa/game-sheet/imports/[id]/reanalyze/route");
const params = { params: Promise.resolve({ id: "i1" }) };
const req = () => new Request("http://x", { method: "POST", body: "{}" });

beforeEach(() => {
  reanalyzeImport.mockClear();
});

function as(isLigaAdmin: boolean, status: string) {
  authorize.mockResolvedValue({ ok: true, access: { isLigaAdmin } });
  loadImport.mockResolvedValue({ id: "i1", event_id: "g1", status, doc_type: "game_sheet", updated_at: "t" });
}

describe("reanalisar boletim", () => {
  it("admin da liga pode reanalisar um boletim já publicado", async () => {
    as(true, "published");
    expect((await POST(req(), params)).status).toBe(200);
    expect(reanalyzeImport).toHaveBeenCalledTimes(1);
  });

  it("a equipa não pode reanalisar um boletim publicado → 409", async () => {
    as(false, "published");
    expect((await POST(req(), params)).status).toBe(409);
    expect(reanalyzeImport).not.toHaveBeenCalled();
  });

  it("boletim confirmado continua bloqueado, mesmo para o admin → 409", async () => {
    as(true, "confirmed");
    expect((await POST(req(), params)).status).toBe(409);
    expect(reanalyzeImport).not.toHaveBeenCalled();
  });

  it("boletim por rever continua a poder ser reanalisado pela equipa", async () => {
    as(false, "needs_review");
    expect((await POST(req(), params)).status).toBe(200);
    expect(reanalyzeImport).toHaveBeenCalledTimes(1);
  });
});
