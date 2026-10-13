import { describe, it, expect } from "vitest";
import { eligibleRoster, buildAttendanceRecords, hasUnsavedChanges } from "./attendance-form";

const roster = [
  { user_id: "u-ana", player_id: "p-ana", active: true },
  { user_id: "u-novo", player_id: null, active: true },      // sem perfil nesta época
  { user_id: "u-pend", player_id: "p-pend", active: false }, // perfil na época, conta ainda por ativar
];

describe("eligibleRoster (PRES-04; revisão final, Importante 4)", () => {
  it("todos os atletas com perfil na época, incluindo contas por ativar", () => {
    expect(eligibleRoster(roster).map((p) => p.player_id)).toEqual(["p-ana", "p-pend"]);
  });
  it("exclui quem não tem perfil nesta época", () => {
    expect(eligibleRoster(roster).some((p) => p.player_id === null)).toBe(false);
  });
});

describe("buildAttendanceRecords", () => {
  it("envia todos os atletas elegíveis marcados (chave = player_id)", () => {
    const records = buildAttendanceRecords(eligibleRoster(roster), { "p-ana": "present" });
    expect(records).toEqual([{ player_id: "p-ana", status: "present" }]);
  });
  it("não inclui atletas sem estado", () => {
    expect(buildAttendanceRecords(eligibleRoster(roster), {})).toEqual([]);
  });
});

describe("hasUnsavedChanges (PRES-19)", () => {
  it("falso quando nada mudou", () => {
    expect(hasUnsavedChanges({ "p-ana": "absent" }, { "p-ana": "absent" })).toBe(false);
  });
  it("verdadeiro quando um estado mudou ou foi acrescentado", () => {
    expect(hasUnsavedChanges({ "p-ana": "absent" }, { "p-ana": "present" })).toBe(true);
    expect(hasUnsavedChanges({}, { "p-ana": "present" })).toBe(true);
  });
});
