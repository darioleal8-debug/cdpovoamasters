import { describe, it, expect } from "vitest";
import { hasAnyRole, isActiveProfile, MANAGERS, FINANCE, ADMIN } from "./roles";

describe("hasAnyRole", () => {
  it("aceita papel primário no grupo", () => {
    expect(hasAnyRole({ role: "treinador", roles_extra: [] }, MANAGERS)).toBe(true);
  });
  it("aceita papel secundário (roles_extra) no grupo", () => {
    expect(hasAnyRole({ role: "jogador", roles_extra: ["treinador"] }, MANAGERS)).toBe(true);
  });
  it("rejeita tesoureiro na gestão desportiva", () => {
    expect(hasAnyRole({ role: "tesoureiro", roles_extra: null }, MANAGERS)).toBe(false);
  });
  it("rejeita seccionista nas finanças", () => {
    expect(hasAnyRole({ role: "seccionista", roles_extra: [] }, FINANCE)).toBe(false);
  });
  it("só admin no grupo ADMIN", () => {
    expect(hasAnyRole({ role: "treinador", roles_extra: [] }, ADMIN)).toBe(false);
    expect(hasAnyRole({ role: "admin", roles_extra: [] }, ADMIN)).toBe(true);
  });
});

describe("isActiveProfile", () => {
  it("rejeita perfil inexistente ou desativado", () => {
    expect(isActiveProfile(null)).toBe(false);
    expect(isActiveProfile({ id: "u", role: "admin", roles_extra: [], active: false })).toBe(false);
  });
  it("aceita perfil ativo", () => {
    expect(isActiveProfile({ id: "u", role: "jogador", roles_extra: [], active: true })).toBe(true);
  });
});

import { evaluateAccess } from "./roles";

describe("evaluateAccess", () => {
  const ativo = { id: "u1", role: "jogador" as const, roles_extra: [], active: true };
  it("401 sem sessão", () => {
    expect(evaluateAccess(false, null, MANAGERS)).toEqual({ ok: false, status: 401, error: "Não autenticado." });
  });
  it("403 com sessão mas sem perfil", () => {
    expect(evaluateAccess(true, null, undefined)).toMatchObject({ ok: false, status: 403 });
  });
  it("403 para conta desativada mesmo sem grupo exigido", () => {
    expect(evaluateAccess(true, { ...ativo, active: false }, undefined)).toMatchObject({ ok: false, status: 403 });
  });
  it("403 para jogador numa ação de gestão", () => {
    expect(evaluateAccess(true, ativo, MANAGERS)).toMatchObject({ ok: false, status: 403 });
  });
  it("ok para jogador ativo quando só se exige sessão", () => {
    expect(evaluateAccess(true, ativo, undefined)).toEqual({ ok: true });
  });
  it("ok para treinador numa ação de gestão", () => {
    expect(evaluateAccess(true, { ...ativo, role: "treinador" }, MANAGERS)).toEqual({ ok: true });
  });
});
