import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  findAuthUserByEmail,
  isEmailExistsError,
  linkExistingAccountToClub,
  linkExistingAccountToTeam,
} from "./link-existing-account";

type Row = Record<string, unknown>;

/** Cliente Supabase mínimo em memória: select/eq/neq/in/maybeSingle/insert/upsert/delete + auth.admin.listUsers. */
function fakeAdmin(tables: Record<string, Row[]>, authUsers: { id: string; email: string }[] = []) {
  const db: Record<string, Row[]> = JSON.parse(JSON.stringify(tables));
  const from = (name: string) => {
    db[name] ??= [];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "delete" = "select";
    const rows = () => db[name].filter((r) => filters.every((f) => f(r)));
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return b; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => { db[name].push(row); return { error: null }; },
      upsert: async (row: Row, o: { onConflict: string }) => {
        const keys = o.onConflict.split(",");
        const i = db[name].findIndex((r) => keys.every((k) => r[k] === row[k]));
        if (i >= 0) db[name][i] = { ...db[name][i], ...row }; else db[name].push(row);
        return { error: null };
      },
      delete: () => { op = "delete"; return b; },
      then: (res: (v: { data: Row[]; error: null }) => unknown) => {
        if (op === "delete") { const del = new Set(rows()); db[name] = db[name].filter((r) => !del.has(r)); return res({ data: [], error: null }); }
        return res({ data: rows(), error: null });
      },
    };
    return b;
  };
  const admin = {
    from,
    auth: { admin: { listUsers: async ({ page, perPage }: { page: number; perPage: number }) => ({
      data: { users: authUsers.slice((page - 1) * perPage, page * perPage) }, error: null,
    }) } },
  };
  return { admin: admin as never, db };
}

describe("isEmailExistsError", () => {
  it("reconhece o código e as duas variantes de mensagem", () => {
    expect(isEmailExistsError({ code: "email_exists" })).toBe(true);
    expect(isEmailExistsError({ message: "A user with this email address has already been registered" })).toBe(true);
    expect(isEmailExistsError({ message: "User already registered" })).toBe(true);
    expect(isEmailExistsError({ message: "network down" })).toBe(false);
    expect(isEmailExistsError(null)).toBe(false);
  });
});

describe("findAuthUserByEmail", () => {
  it("encontra ignorando maiúsculas e atravessa páginas", async () => {
    const users = Array.from({ length: 250 }, (_, i) => ({ id: `u${i}`, email: `x${i}@a.pt` }));
    users[230] = { id: "alvo", email: "Helder@Gmail.com" };
    const { admin } = fakeAdmin({}, users);
    expect(await findAuthUserByEmail(admin, " helder@gmail.com ")).toEqual({ id: "alvo", email: "Helder@Gmail.com" });
    expect(await findAuthUserByEmail(admin, "nao@existe.pt")).toBeNull();
  });
});

describe("linkExistingAccountToClub", () => {
  const base = { userId: "u1", email: "h@x.pt", name: "Helder", role: "admin", clubId: "c1" };

  it("conta de delegado da equipa do clube, sem perfil: cria perfil e associa ao clube", async () => {
    const { admin, db } = fakeAdmin({
      clubs: [{ id: "c1", league_team_id: "t1" }],
      league_team_members: [{ user_id: "u1", team_id: "t1" }],
    });
    expect(await linkExistingAccountToClub(admin, base)).toEqual({ ok: true, alreadyLinked: false });
    expect(db.users).toEqual([expect.objectContaining({ id: "u1", role: "admin", active: true, status: "ativo" })]);
    expect(db.club_members).toEqual([expect.objectContaining({ club_id: "c1", user_id: "u1", role: "admin", active: true })]);
  });

  it("é idempotente quando já está associada", async () => {
    const { admin, db } = fakeAdmin({
      clubs: [{ id: "c1", league_team_id: "t1" }],
      users: [{ id: "u1" }],
      club_members: [{ club_id: "c1", user_id: "u1", role: "treinador", active: false }],
      league_team_members: [{ user_id: "u1", team_id: "t1" }],
    });
    expect(await linkExistingAccountToClub(admin, base)).toEqual({ ok: true, alreadyLinked: true });
    expect(db.club_members).toHaveLength(1);
    expect(db.club_members[0]).toMatchObject({ role: "admin", active: true });
  });

  it("recusa conta que já pertence a outro clube", async () => {
    const { admin, db } = fakeAdmin({
      clubs: [{ id: "c1", league_team_id: "t1" }, { id: "c2", league_team_id: "t2" }],
      club_members: [{ club_id: "c2", user_id: "u1" }],
    });
    expect(await linkExistingAccountToClub(admin, base)).toMatchObject({ ok: false, status: 409 });
    expect(db.club_members).toHaveLength(1);
  });

  it("recusa delegado de outra equipa da Liga", async () => {
    const { admin, db } = fakeAdmin({
      clubs: [{ id: "c1", league_team_id: "t1" }],
      league_team_members: [{ user_id: "u1", team_id: "t9" }],
    });
    expect(await linkExistingAccountToClub(admin, base)).toMatchObject({ ok: false, status: 409 });
    expect(db.club_members ?? []).toHaveLength(0);
  });

  it("recusa delegado quando o clube não tem equipa da Liga associada", async () => {
    const { admin } = fakeAdmin({
      clubs: [{ id: "c1", league_team_id: null }],
      league_team_members: [{ user_id: "u1", team_id: "t1" }],
    });
    expect(await linkExistingAccountToClub(admin, base)).toMatchObject({ ok: false, status: 409 });
  });

  it("404 se o clube não existe", async () => {
    const { admin } = fakeAdmin({ clubs: [] });
    expect(await linkExistingAccountToClub(admin, base)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("linkExistingAccountToTeam", () => {
  const base = { userId: "u1", teamId: "t1", createdBy: "admin1" };

  it("conta de administrador do clube ligado à equipa: passa a delegado", async () => {
    const { admin, db } = fakeAdmin({
      clubs: [{ id: "c1", league_team_id: "t1" }],
      club_members: [{ club_id: "c1", user_id: "u1" }],
    });
    expect(await linkExistingAccountToTeam(admin, base)).toEqual({ ok: true });
    expect(db.league_team_members).toEqual([{ user_id: "u1", team_id: "t1", role: "delegate", created_by: "admin1" }]);
  });

  it("conta sem clube nem equipa: associa", async () => {
    const { admin, db } = fakeAdmin({});
    expect(await linkExistingAccountToTeam(admin, base)).toEqual({ ok: true });
    expect(db.league_team_members).toHaveLength(1);
  });

  it("idempotente se já é delegado desta equipa", async () => {
    const { admin, db } = fakeAdmin({ league_team_members: [{ user_id: "u1", team_id: "t1" }] });
    expect(await linkExistingAccountToTeam(admin, base)).toEqual({ ok: true, alreadyLinked: true });
    expect(db.league_team_members).toHaveLength(1);
  });

  it("recusa delegado de outra equipa", async () => {
    const { admin } = fakeAdmin({ league_team_members: [{ user_id: "u1", team_id: "t2" }] });
    expect(await linkExistingAccountToTeam(admin, base)).toMatchObject({ ok: false, status: 409 });
  });

  it("recusa conta de um clube ligado a outra equipa", async () => {
    const { admin, db } = fakeAdmin({
      clubs: [{ id: "c2", league_team_id: "t2" }],
      club_members: [{ club_id: "c2", user_id: "u1" }],
    });
    expect(await linkExistingAccountToTeam(admin, base)).toMatchObject({ ok: false, status: 409 });
    expect(db.league_team_members ?? []).toHaveLength(0);
  });
});
