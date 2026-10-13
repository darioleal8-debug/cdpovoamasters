import { describe, it, expect } from "vitest";
import { parseDate, parseGameLine, parsePDFText, normalizeTeamName } from "./calendar-parser";

describe("parseDate (CONV-09, CONV-11)", () => {
  it("aceita data sem dia da semana", () => {
    expect(parseDate("15/10/2026")).toBe("2026-10-15");
    expect(parseDate("5/10/2026")).toBe("2026-10-05");
    expect(parseDate("15.10.2026")).toBe("2026-10-15");
  });
  it("aceita data com dia da semana", () => {
    expect(parseDate("qui, 15/10/2026")).toBe("2026-10-15");
    expect(parseDate("Sáb. 17/10/2026")).toBe("2026-10-17");
  });
  it("rejeita datas impossíveis", () => {
    expect(parseDate("qui 31/02/2026")).toBeNull();
    expect(parseDate("31/04/2026")).toBeNull();
  });
});

describe("equipa do clube com acento (CONV-10)", () => {
  it("'CD Póvoa' é reconhecida pelo padrão sem acento", () => {
    const g = parseGameLine("7   SC Braga   CD Póvoa   16/10/2026   21:30   Pav. X   Braga", 2, /Povoa/i);
    expect(g?.is_our_game).toBe(true);
  });
  it("normalizeTeamName não precisa de remover acentos para o nome mostrado", () => {
    expect(normalizeTeamName("CD Póvoa")).toContain("Póvoa");
  });
});

describe("parseGameLine (CONV-11)", () => {
  it("não corta o nome da equipa visitante antes da data", () => {
    const g = parseGameLine("7   SC Braga   CD Povoa   16/10/2026   21:30   Pav. X   Braga", 2, /Povoa/i);
    expect(g?.away_team).toBe("CD Povoa");
    expect(g?.date).toBe("2026-10-16");
  });
});

describe("parsePDFText (CONV-11)", () => {
  it("cabeçalho 'JORNADA 3 - 2ª VOLTA' na mesma linha mantém os jogos seguintes", () => {
    const r = parsePDFText("JORNADA 3 - 2ª VOLTA\n1   CD Povoa   SC Braga   sex 16/10/2026   21:30   Pav.   Povoa", "Póvoa");
    expect(r.games.length).toBe(1);
    expect(r.games[0].jornada).toBe(3);
  });
});
