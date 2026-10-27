import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let isAdmin = true;
let photoUrl: string | null = "u1/2026/g1/folha.jpg";
let signError = false;
const signCalls: { bucket: string; path: string; ttl: number }[] = [];

vi.mock("@/lib/auth/liga-admin-guard", () => ({
  authorizeAsLigaAdmin: async () =>
    isAdmin
      ? { ok: true, user: { id: "admin" } }
      : { ok: false, response: NextResponse.json({ error: "Sem permissão de admin da liga" }, { status: 403 }) },
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: photoUrl === undefined ? null : { photo_url: photoUrl } }) }) }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          signCalls.push({ bucket, path, ttl });
          return signError
            ? { data: null, error: { message: "Object not found" } }
            : { data: { signedUrl: `https://storage.example/${bucket}/${path}?token=t` }, error: null };
        },
      }),
    },
  }),
}));

const { GET } = await import("@/app/api/liga/admin/submissions/[id]/sheet/route");
const ID = "4dd78df3-269f-4d32-9532-d1bb027c5e0d";
const call = (id = ID) => GET(new Request("http://x"), { params: Promise.resolve({ id }) });

beforeEach(() => {
  isAdmin = true;
  photoUrl = "u1/2026/g1/folha.jpg";
  signError = false;
  signCalls.length = 0;
});

describe("GET /api/liga/admin/submissions/[id]/sheet", () => {
  it("só admins da liga", async () => {
    isAdmin = false;
    expect((await call()).status).toBe(403);
    expect(signCalls).toEqual([]);
  });

  it("redireciona para um URL assinado de curta duração, sem cache", async () => {
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/folhas-jogo/u1/2026/g1/folha.jpg?token=t");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(signCalls).toEqual([{ bucket: "folhas-jogo", path: "u1/2026/g1/folha.jpg", ttl: 600 }]);
  });

  it("volta a assinar URLs antigos já expirados", async () => {
    photoUrl = "https://x.supabase.co/storage/v1/object/sign/game-sheets/dd34/1792.jpg?token=old";
    await call();
    expect(signCalls[0]).toMatchObject({ bucket: "game-sheets", path: "dd34/1792.jpg" });
  });

  it("submissão sem folha ou ficheiro em falta → 404", async () => {
    photoUrl = null;
    expect((await call()).status).toBe(404);
    photoUrl = "u1/a.jpg";
    signError = true;
    expect((await call()).status).toBe(404);
  });

  it("id inválido → 400", async () => {
    expect((await call("../x")).status).toBe(400);
  });
});
