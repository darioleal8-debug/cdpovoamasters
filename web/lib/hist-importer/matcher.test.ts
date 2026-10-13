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

describe("matchHistPlayers — revisão A.2 (Imp. 4: ambíguas não criam jogador por omissão)", () => {
  it("um único candidato abaixo do limiar vem pré-selecionado", () => {
    const [row] = matchHistPlayers([ext("Rui Csota")], [{ id: "a", name: "Rui Costa" }] as never);
    expect(row).toMatchObject({ hist_player_id: "a", status: "ambiguous", include: true });
  });
  it("ambígua sem escolha possível fica excluída (não cria duplicado)", () => {
    const rows = matchHistPlayers([ext("Rui Costa"), ext("Rui Costa")], [{ id: "a", name: "Rui Costa" }, { id: "b", name: "Rui Pinto" }] as never);
    expect(rows[1].status).toBe("ambiguous");
    expect(rows[1].hist_player_id === null && rows[1].include === true).toBe(false);
    expect(rows[1].hist_player_id).not.toBe("b"); // não pré-seleciona o "Rui Pinto" (candidato fraco)
  });
  it("controlo: jogador realmente novo continua 'new'", () => {
    const [row] = matchHistPlayers([ext("Zé Manel")], [{ id: "a", name: "Rui Costa" }] as never);
    expect(row.status).toBe("new");
  });
});
