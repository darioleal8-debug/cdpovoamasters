import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlayerFields, rosterPromptBlock, splitFullName, loadHoophubRoster, loadTeamRoster, type RosterPlayer } from "./roster";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiProStatsSchema, aiToProStats } from "@/lib/match-docs/pro-stats-schema";
import { validateProStats } from "@/lib/match-docs/validate";
import { reconcile, type KnownPlayer } from "@/lib/match-docs/reconcile";

const GAME = { home: "Aroso", away: "Paredes" };
const rp = (number: number, first: string, last: string): RosterPlayer => ({ id: `r${number}`, teamId: "t", firstName: first, lastName: last, number, photoUrl: null, source: "liga" });
const ROSTER = [rp(4, "Afonso", "Silva"), rp(5, "Miguel", "Pereira"), rp(6, "Tiago", "Coelho"), rp(12, "João", "Ferreira"), rp(14, "Miguel", "Costa"), rp(15, "Orio", "Santos"), rp(21, "Rui", "Nunes")];
const known = (r: RosterPlayer[]): KnownPlayer[] => r.map((p) => ({ name: `${p.firstName} ${p.lastName}`, number: p.number, rosterId: p.id, source: "roster" }));

function pocket() {
  const ai = JSON.parse(readFileSync(join(__dirname, "../match-docs/__fixtures__/pocketstat-aroso-paredes.ai.json"), "utf8"));
  return aiToProStats(AiProStatsSchema.parse(ai), GAME);
}
function run(knownHome: KnownPlayer[]) {
  const data = pocket();
  return reconcile({
    game: GAME, official: [],
    pro: [{ docType: "pro_stats", importId: "pro", teamSide: "home", label: "Pocket", confidence: 0.95, createdAt: "x", data, issues: validateProStats(data, { names: GAME }) }],
    known: { home: knownHome, away: [] },
  });
}

describe("validação dos campos do plantel", () => {
  it("aceita nomes portugueses e normaliza espaços", () => {
    expect(parsePlayerFields({ first_name: "  João ", last_name: "D'Almeida  Sá-Pinto", number: "7" })).toEqual({ ok: true, value: { first_name: "João", last_name: "D'Almeida Sá-Pinto", number: 7 } });
  });
  it("rejeita número fora de 0–99, nomes vazios ou com símbolos", () => {
    expect(parsePlayerFields({ first_name: "Rui", last_name: "Costa", number: "100" }).ok).toBe(false);
    expect(parsePlayerFields({ first_name: "", last_name: "Costa", number: "1" }).ok).toBe(false);
    expect(parsePlayerFields({ first_name: "Rui<script>", last_name: "Costa", number: "1" }).ok).toBe(false);
    expect(parsePlayerFields({ first_name: "Rui", last_name: "Costa" }).ok).toBe(false); // número obrigatório
  });
  it("edição parcial só valida o que vem", () => {
    expect(parsePlayerFields({ number: "23" }, true)).toEqual({ ok: true, value: { number: 23 } });
  });
});

describe("plantel no prompt do DeepSeek", () => {
  it("lista número + nome completo e proíbe acrescentar jogadores", () => {
    const t = rosterPromptBlock({ home: ROSTER.slice(0, 2), away: [] }, GAME);
    expect(t).toContain("Aroso: #4 Afonso Silva; #5 Miguel Pereira");
    expect(t).toContain("NÃO acrescentes jogadores");
    expect(rosterPromptBlock({ home: [], away: [] }, GAME)).toBe("");
  });
});

describe("cruzamento com o plantel registado", () => {
  it("número + nome coincidem → confirmado e nome completo do plantel", () => {
    const r = run(known(ROSTER));
    const afonso = r.players.find((p) => p.number === 4)!;
    expect(afonso).toMatchObject({ name: "Afonso Silva", readName: "Afonso", rosterId: "r4", inDatabase: true });
    expect(afonso.sources.name).toBe("roster");
    // "JOÃO" (maiúsculas) e homónimos "Miguel" #5 / "Miguel Costa" #14 resolvidos pelo número
    expect(r.players.find((p) => p.number === 12)!.name).toBe("João Ferreira");
    expect(r.players.find((p) => p.number === 5)!.name).toBe("Miguel Pereira");
    expect(r.players.find((p) => p.number === 14)!.name).toBe("Miguel Costa");
  });

  it("nome do plantel com outro número → divergência no número (não bloqueia)", () => {
    const roster = ROSTER.map((p) => (p.lastName === "Coelho" ? { ...p, number: 7 } : p)); // Coelho é o #7 no plantel; lido #6
    const r = run(known(roster));
    const d = r.discrepancies.find((x) => x.id.endsWith(":roster_number"))!;
    expect(d).toMatchObject({ severity: "medium", chosen: 7, field: expect.stringMatching(/\.number$/) });
    expect(d.reason).toContain("Tiago Coelho tem o #7");
    expect(r.publishable).toBe(true); // divergência média: informa, não bloqueia
  });

  it("número do plantel com nome diferente → divergência no nome", () => {
    const roster = ROSTER.map((p) => (p.number === 15 ? { ...p, firstName: "Rui", lastName: "Gomes" } : p)).filter((p) => p.number !== 21);
    const r = run(known(roster));
    const d = r.discrepancies.find((x) => x.id.endsWith(":roster_name"))!;
    expect(d).toMatchObject({ chosen: "Rui Gomes", teamA: "Orio" });
  });

  it("jogadores fora do plantel registado ficam assinalados", () => {
    const r = run(known(ROSTER));
    const sergio = r.players.find((p) => p.name === "Sérgio")!;
    expect(sergio.inDatabase).toBe(false);
    expect(r.notes.join(" ")).toContain("não constam do plantel registado");
  });

  it("aplicar o valor do plantel via correção resolve a divergência", () => {
    const roster = ROSTER.map((p) => (p.lastName === "Coelho" ? { ...p, number: 7 } : p));
    const first = run(known(roster));
    const d = first.discrepancies.find((x) => x.id.endsWith(":roster_number"))!;
    const data = pocket();
    const r = reconcile({
      game: GAME, official: [],
      pro: [{ docType: "pro_stats", importId: "pro", teamSide: "home", label: "Pocket", confidence: 0.95, createdAt: "x", data, issues: validateProStats(data, { names: GAME }) }],
      known: { home: known(roster), away: [] }, overrides: { [d.field]: 7 },
    });
    expect(r.discrepancies.find((x) => x.id === d.id)!.resolved).toBe(true);
  });
});


/** Cliente falso: devolve linhas por tabela, ignora filtros (a lógica sob teste é a composição). */
function fakeDb(tables: Record<string, unknown[]>): SupabaseClient {
  const q = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) b[m] = () => b;
    b.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
    return b;
  };
  return { from: (t: string) => q(tables[t] ?? []), storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }) }) } } as unknown as SupabaseClient;
}

describe("plantel HoopHub → Liga", () => {
  it("separa primeiro e último nome", () => {
    expect(splitFullName("Rui Castro")).toEqual({ firstName: "Rui", lastName: "Castro" });
    expect(splitFullName("  João   Pedro  Silva ")).toEqual({ firstName: "João", lastName: "Pedro Silva" });
    expect(splitFullName("Pelé")).toEqual({ firstName: "Pelé", lastName: "" });
  });

  const hoophub = {
    seasons: [{ id: "s1" }],
    v_active_roster: [
      { player_id: "p2", name: "Augusto Cunha", number: 10 },
      { player_id: "p1", name: "Rui Castro", number: 5 },
      { player_id: "p3", name: "Sem Numero", number: null },
    ],
    players: [{ id: "p1", photo_url: "https://h/p1.jpg", processed_photo_url: null }, { id: "p2", photo_url: "https://h/p2.jpg", processed_photo_url: "https://h/p2-proc.jpg" }],
  };

  it("usa o plantel HoopHub (ordenado, com fotos) quando a equipa tem época ativa", async () => {
    const r = await loadHoophubRoster(fakeDb(hoophub), "t");
    expect(r.map((p) => [p.number, p.firstName, p.lastName, p.source])).toEqual([[5, "Rui", "Castro", "hoophub"], [10, "Augusto", "Cunha", "hoophub"], [null, "Sem", "Numero", "hoophub"]]);
    expect(r[1].photoUrl).toBe("https://h/p2-proc.jpg");
    expect(r[0].photoUrl).toBe("https://h/p1.jpg");
  });

  it("o plantel HoopHub tem prioridade sobre o registado pelo delegado", async () => {
    const r = await loadTeamRoster(fakeDb({ ...hoophub, league_team_players: [{ id: "x", team_id: "t", first_name: "Outro", last_name: "Jogador", number: 1, photo_path: null }] }), "t");
    expect(r.every((p) => p.source === "hoophub")).toBe(true);
  });

  it("sem HoopHub, mantém o plantel do delegado", async () => {
    const r = await loadTeamRoster(fakeDb({ seasons: [], league_team_players: [{ id: "x", team_id: "t", first_name: "Outro", last_name: "Jogador", number: 1, photo_path: "t/a.webp" }] }), "t");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: "liga", firstName: "Outro", photoUrl: "https://x/t/a.webp" });
  });
});
