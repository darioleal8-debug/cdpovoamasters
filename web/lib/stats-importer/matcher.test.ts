import { describe, it, expect } from "vitest";
import { matchPlayers } from "./matcher";
import type { ExtractedPlayerStats } from "./types";

const ext = (pdf_name: string, pdf_number: number | null = null) =>
  ({ pdf_name, pdf_number, pts: 0 } as unknown as ExtractedPlayerStats);

describe("matchPlayers (STA-13)", () => {
  it("nome ambíguo ('Rui' com dois Rui) fica ambiguous, nunca ok", () => {
    const roster = [{ id: "a", name: "Rui Costa", number: 4 }, { id: "b", name: "Rui Pinto", number: 7 }];
    const [row] = matchPlayers([ext("Rui")], roster);
    expect(row.status).toBe("ambiguous");
  });
  it("nome vazio fica unmatched", () => {
    const [row] = matchPlayers([ext("")], [{ id: "a", name: "Rui Costa", number: 4 }]);
    expect(row.status).toBe("unmatched");
    expect(row.player_id).toBeNull();
  });
  it("'P. Silva' não é atribuído automaticamente ao João Silva", () => {
    const roster = [{ id: "a", name: "João Silva", number: 5 }, { id: "b", name: "Pedro Silva", number: 9 }];
    const [row] = matchPlayers([ext("P. Silva")], roster);
    expect(row.player_id === "a" && row.status === "ok").toBe(false);
  });
  it("duas linhas para o mesmo jogador: a segunda deixa de ser ok", () => {
    const roster = [{ id: "a", name: "Rui Costa", number: 4 }, { id: "b", name: "Ana Lopes", number: 8 }];
    const rows = matchPlayers([ext("Rui Costa", 4), ext("R. Costa")], roster);
    expect(rows[0].status).toBe("ok");
    expect(rows[1].player_id === "a" && rows[1].status === "ok").toBe(false);
  });
  it("controlo: nome exato associa ok", () => {
    const roster = [{ id: "a", name: "Rui Costa", number: 4 }, { id: "b", name: "Ana Lopes", number: 8 }];
    const [row] = matchPlayers([ext("Rui Costa")], roster);
    expect(row).toMatchObject({ player_id: "a", status: "ok" });
  });
});
