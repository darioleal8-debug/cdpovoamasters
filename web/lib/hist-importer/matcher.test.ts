import { describe, it, expect } from "vitest";
import { matchHistPlayers } from "./matcher";
import type { HistExtractedPlayer } from "./types";

const ext = (pdf_name: string) => ({ pdf_name, pdf_number: null } as unknown as HistExtractedPlayer);

describe("matchHistPlayers (STA-13, histórico)", () => {
  const existing = [{ id: "a", name: "Rui Costa" }, { id: "b", name: "Rui Pinto" }];
  it("'Rui' com dois Rui existentes não é associado automaticamente", () => {
    const [row] = matchHistPlayers([ext("Rui")], existing as never);
    expect(row.status).toBe("ambiguous");
    expect(row.hist_player_id).toBeNull();
  });
  it("nome vazio não cria jogador novo nem associa", () => {
    const [row] = matchHistPlayers([ext("  ")], existing as never);
    expect(row.status).toBe("ambiguous");
    expect(row.include).toBe(false);
  });
  it("o mesmo jogador histórico não é associado a duas linhas", () => {
    const rows = matchHistPlayers([ext("Rui Costa"), ext("Rui Costa")], existing as never);
    expect(rows[0].status).toBe("ok");
    expect(rows[1].status).not.toBe("ok");
  });
  it("controlo: nome exato associa ok", () => {
    const [row] = matchHistPlayers([ext("Rui Pinto")], existing as never);
    expect(row).toMatchObject({ hist_player_id: "b", status: "ok" });
  });
});
