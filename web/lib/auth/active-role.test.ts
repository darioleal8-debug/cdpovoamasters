import { describe, it, expect } from "vitest";
import { availableRoles, applyActiveRole, homeForRole, parseActiveRoleRequest } from "./active-role";

const nuno = { id: "u1", role: "admin" as const, roles_extra: ["treinador", "jogador"], active: true };

describe("papel ativo", () => {
  it("lista os papéis da conta, primário primeiro e sem duplicados", () => {
    expect(availableRoles(nuno)).toEqual(["admin", "treinador", "jogador"]);
    expect(availableRoles({ role: "admin", roles_extra: ["admin"] })).toEqual(["admin"]);
    expect(availableRoles({ role: "jogador", roles_extra: null })).toEqual(["jogador"]);
  });

  it("papel escolhido que a conta tem → passa a ser o único papel efetivo", () => {
    expect(applyActiveRole(nuno, "treinador")).toEqual({ ...nuno, role: "treinador", roles_extra: [] });
    expect(applyActiveRole(nuno, "jogador")).toEqual({ ...nuno, role: "jogador", roles_extra: [] });
  });

  it("sem escolha, escolha inválida ou papel que a conta não tem → perfil real (nunca sobe privilégios)", () => {
    expect(applyActiveRole(nuno, undefined)).toBe(nuno);
    expect(applyActiveRole(nuno, "")).toBe(nuno);
    expect(applyActiveRole(nuno, "tesoureiro")).toBe(nuno);
    const jogador = { id: "u2", role: "jogador" as const, roles_extra: [], active: true };
    expect(applyActiveRole(jogador, "admin")).toBe(jogador);
  });

  it("página inicial de cada papel", () => {
    expect(homeForRole("jogador")).toBe("/player");
    expect(homeForRole("seccionista")).toBe("/jogos");
    expect(homeForRole("admin")).toBe("/dashboard");
    expect(homeForRole("treinador")).toBe("/dashboard");
    expect(homeForRole("tesoureiro")).toBe("/dashboard");
  });

  it("pedido de troca só aceita papéis da conta", () => {
    expect(parseActiveRoleRequest(nuno, { role: "treinador" })).toEqual({ ok: true, role: "treinador" });
    expect(parseActiveRoleRequest(nuno, { role: "tesoureiro" })).toEqual({ ok: false });
    expect(parseActiveRoleRequest(nuno, { role: 42 })).toEqual({ ok: false });
    expect(parseActiveRoleRequest(nuno, null)).toEqual({ ok: false });
  });
});
