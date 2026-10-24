import { describe, test, expect } from "vitest";
import { computeStandings, normalizeName } from "@/types/competitions";
import type { LeagueTeam } from "@/types/competitions";

// ── normalizeName ─────────────────────────────────────────────────────────────

describe("normalizeName", () => {
  test("remove acentos e lowercase", () => {
    expect(normalizeName("CD Póvoa Masters")).toBe("cd povoa masters");
  });

  test("colapsa espaços múltiplos", () => {
    expect(normalizeName("ABC  DEF")).toBe("abc def");
  });

  test("remove pontuação", () => {
    expect(normalizeName("A.B.C.")).toBe("abc");
  });
});

// ── computeStandings sem seed ─────────────────────────────────────────────────

describe("computeStandings (sem seedTeams)", () => {
  test("retorna vazio quando não há resultados", () => {
    expect(computeStandings([])).toEqual([]);
  });

  test("conta pontos INATEL correctamente (vitória=2, derrota=1)", () => {
    const results = [{ home_team_name: "A", away_team_name: "B", home_score: 80, away_score: 70 }];
    const s = computeStandings(results);
    const a = s.find((r) => r.team_name === "A")!;
    const b = s.find((r) => r.team_name === "B")!;
    expect(a.pts).toBe(2); expect(a.wins).toBe(1); expect(a.losses).toBe(0);
    expect(b.pts).toBe(1); expect(b.wins).toBe(0); expect(b.losses).toBe(1);
  });

  test("ordena por pontos, depois diferença, depois PM", () => {
    const results = [
      { home_team_name: "A", away_team_name: "B", home_score: 80, away_score: 70 },
      { home_team_name: "C", away_team_name: "D", home_score: 90, away_score: 60 },
    ];
    const s = computeStandings(results);
    // A e C têm 2 pts; C tem diff +30, A tem diff +10 → C primeiro
    expect(s[0].team_name).toBe("C");
    expect(s[1].team_name).toBe("A");
  });
});

// ── computeStandings com seed ─────────────────────────────────────────────────

type SeedTeam = Pick<LeagueTeam, "id" | "name" | "normalized_name">;

const seedTeams: SeedTeam[] = [
  { id: "id-a", name: "Equipa A", normalized_name: "equipa a" },
  { id: "id-b", name: "Equipa B", normalized_name: "equipa b" },
  { id: "id-c", name: "Equipa C", normalized_name: "equipa c" },
];

describe("computeStandings (com seedTeams)", () => {
  test("equipas sem jogos aparecem a zero", () => {
    const results = [
      { home_team_name: "Equipa A", away_team_name: "Equipa B", home_score: 80, away_score: 70 },
    ];
    const s = computeStandings(results, seedTeams);
    // Equipa C não jogou mas deve aparecer
    const c = s.find((r) => r.team_name === "Equipa C");
    expect(c).toBeDefined();
    expect(c!.gp).toBe(0);
    expect(c!.pts).toBe(0);
  });

  test("resolve variante de nome para equipa canónica", () => {
    // "equipa a masters" não está no seed; mas "equipa a" está
    // → como a normalização de "Equipa A Masters" ≠ "equipa a", fica como fallback separado
    // Teste positivo: variante que normaliza para o mesmo valor
    const results = [
      { home_team_name: "EQUIPA A", away_team_name: "Equipa B", home_score: 80, away_score: 70 },
    ];
    const s = computeStandings(results, seedTeams);
    const a = s.find((r) => r.team_name === "Equipa A")!;
    expect(a).toBeDefined();
    expect(a.gp).toBe(1);
    expect(a.pts).toBe(2);
    expect(a.team_id).toBe("id-a");
  });

  test("usa nome canónico do seed (não o nome do resultado)", () => {
    const results = [
      { home_team_name: "equipa a", away_team_name: "equipa b", home_score: 60, away_score: 70 },
    ];
    const s = computeStandings(results, seedTeams);
    const a = s.find((r) => r.team_id === "id-a")!;
    expect(a.team_name).toBe("Equipa A"); // nome canónico, não o lowercase do resultado
    expect(a.pts).toBe(1);               // perdeu
  });

  test("desempate por pontos → diferença → PM", () => {
    const results = [
      { home_team_name: "Equipa A", away_team_name: "Equipa B", home_score: 90, away_score: 80 },
      { home_team_name: "Equipa A", away_team_name: "Equipa C", home_score: 70, away_score: 60 },
    ];
    const s = computeStandings(results, seedTeams);
    // A: 4pts, diff +20, pf=160
    // B: 1pt, diff -10; C: 1pt, diff -10, pf=60 vs pf=80
    expect(s[0].team_id).toBe("id-a");
    // B e C: mesmo pts e diff (-10), B pf=80 > C pf=60 → B antes de C
    expect(s[1].team_id).toBe("id-b");
    expect(s[2].team_id).toBe("id-c");
  });

  test("team_id está preenchido nas equipas seed e null nas não-seed", () => {
    const results = [
      { home_team_name: "Equipa A", away_team_name: "Desconhecida FC", home_score: 80, away_score: 70 },
    ];
    const s = computeStandings(results, seedTeams);
    const a = s.find((r) => r.team_name === "Equipa A")!;
    const unknown = s.find((r) => r.team_name === "Desconhecida FC")!;
    expect(a.team_id).toBe("id-a");
    expect(unknown.team_id).toBeUndefined(); // não estava no seed
  });
});
