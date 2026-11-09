import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AiProStatsSchema, aiToProStats, rowToStatLine, teamStat, toSeconds, proFinal, type ProStatsData } from "./pro-stats-schema";
import { validateProStats, validateLine, validatePeriods } from "./validate";
import { reconcile, matchPlayers, isValidOverridePath, playerKey, type OfficialInput, type ProInput } from "./reconcile";
import { toConsolidatedApplyPayload } from "./approval";
import { emptySheetData } from "@/lib/game-sheet/schema";
import type { Analysis } from "@/lib/game-sheet/engine";
import { buildNewsFacts } from "@/lib/game-sheet/news-facts";
import { boxScoresFromDb, newsValidation } from "@/lib/liga/generate-news";

const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", f), "utf8"));
const AROSO = { home: "Aroso", away: "Paredes" };
const MATOSINHOS = { home: "Matosinhos Basket", away: "Famalicense" };

function pocket(): ProStatsData {
  return aiToProStats(AiProStatsSchema.parse(fx("pocketstat-aroso-paredes.ai.json")), AROSO);
}
function dark(): ProStatsData {
  return aiToProStats(AiProStatsSchema.parse(fx("dark-matosinhos-famalicense.ai.json")), MATOSINHOS);
}

function proInput(data: ProStatsData, over: Partial<ProInput> = {}): ProInput {
  return {
    docType: "pro_stats", importId: over.importId ?? "pro-1", teamSide: over.teamSide ?? "home", label: "Pocket Stat",
    confidence: data.aiConfidence, createdAt: "2026-11-06T11:00:00Z", data, issues: validateProStats(data, { names: AROSO }), ...over,
  };
}

/** Folha oficial mínima: só os campos que a reconciliação usa (resultado, parciais, jogadores). */
function officialInput(o: {
  id: string; teamSide: "home" | "away" | null; final: [number, number]; periods: [number, number][];
  players?: { side: "home" | "away"; number: number | null; name: string; points: number; fouls?: number | null }[];
  completeness?: "complete" | "partial" | "none"; canConfirm?: boolean; confidence?: number;
}, game = AROSO): OfficialInput {
  const sheet = emptySheetData(game);
  sheet.final = { home: o.final[0], away: o.final[1] };
  sheet.periods = o.periods.map(([h, a], i) => ({ period: i + 1, home: h, away: a }));
  sheet.aiConfidence = o.confidence ?? 0.8;
  sheet.officials.referees = ["Árbitro Um"];
  const team = (side: "home" | "away") => ({ side, name: game[side], final: null, periodsSum: null, runningLast: null, runningByPeriod: {}, attributed: 0, unattributed: 0, completeness: o.completeness ?? "complete", fouls: null, playersUsed: null, timeouts: null });
  const analysis = {
    events: [], periods: [], issues: [], status: "ready_to_confirm", canConfirm: o.canConfirm ?? true, requiresAcknowledgement: false,
    summary: { winner: null, margin: null, overtime: false, biggestPeriod: null, comeback: null },
    teams: { home: team("home"), away: team("away") },
    players: (o.players ?? []).map((p, i) => ({
      playerId: `p${i}`, side: p.side, number: p.number, name: p.name, hoophubPlayerId: null, points: p.points, byPeriod: {},
      ftMade: 0, fg2Made: 0, fg3Made: 0, fouls: p.fouls ?? null, played: true, pctOfTeam: null,
    })),
  } as unknown as Analysis;
  return { docType: "official_sheet", importId: o.id, teamSide: o.teamSide, label: `Folha ${o.id}`, confidence: sheet.aiConfidence, createdAt: "2026-11-06T10:00:00Z", sheet, analysis };
}

const AROSO_PERIODS: [number, number][] = [[16, 6], [12, 8], [5, 6], [13, 0]];
/** Folha manuscrita com erros de leitura típicos (Orio 13 em vez de 15, Afonso sem número). */
const arosoOfficialPlayers = [
  { side: "home" as const, number: 4, name: "Afonso", points: 11 },
  { side: "home" as const, number: 5, name: "Miguel", points: 3 },
  { side: "home" as const, number: 6, name: "Coelho", points: 6 },
  { side: "home" as const, number: 8, name: "Nuno", points: 2 },
  { side: "home" as const, number: 12, name: "João", points: 4 },
  { side: "home" as const, number: 13, name: "António", points: 1 },
  { side: "home" as const, number: 14, name: "Miguel Costa", points: 4, fouls: 2 },
  { side: "home" as const, number: 15, name: "Orio", points: 15 },
];

// ─────────────────────────────────────────────────────────────────────────────

describe("normalização de estatísticas profissionais", () => {
  it("lê a folha Pocket Stat: jogadores, totais, parciais e linha de equipa sem jogador", () => {
    const d = pocket();
    expect(d.app).toBe("Pocket Stat");
    const aroso = d.teams.home!;
    expect(aroso.players).toHaveLength(12);
    const afonso = aroso.players[0];
    expect(afonso).toMatchObject({ number: 4, name: "Afonso" });
    expect(afonso.stats).toMatchObject({ secs: 14 * 60 + 29, pts: 11, fg2m: 1, fg2a: 5, fg3m: 3, fg3a: 5, ftm: 0, fta: 0, ast: 1, stl: 1, tov: 2, pm: 22, eff: 5 });
    expect(aroso.players.find((p) => p.number === 9)!.stats.eff).toBe(-5);
    expect(aroso.totals).toMatchObject({ pts: 46, fg2m: 10, fg2a: 25, fg3m: 5, fg3a: 20, ftm: 11, fta: 25, oreb: 8, dreb: 16, reb: 24, ast: 7, stl: 11, blk: 1, tov: 12, pf: 4, fd: 17, eff: 33 });
    // Paredes: só linha de equipa → sem estatística individual (não são jogadores com 0)
    const paredes = d.teams.away!;
    expect(paredes.teamOnly).toBe(true);
    expect(paredes.players).toHaveLength(0);
    expect(paredes.totals.pts).toBe(20);
    expect(paredes.totals.ast).toBeNull(); // coluna inexistente ≠ 0
    expect(d.periods.map((p) => [p.home, p.away])).toEqual(AROSO_PERIODS);
    expect(proFinal(d)).toEqual({ home: 46, away: 20 });
  });

  it("valida matematicamente a folha Pocket Stat sem erros", () => {
    expect(validateProStats(pocket(), { names: AROSO }).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("lê o layout FGM-A / 2PM-A / 3PM-A, tabela sem nome de equipa (lado pelo total)", () => {
    const d = dark();
    const t = d.teams.home!;
    expect(d.teams.away).toBeNull();
    expect(t.players).toHaveLength(12);
    expect(t.players[1].stats).toMatchObject({ pts: 9, fg2m: 1, fg2a: 5, fg3m: 0, fg3a: 0, ftm: 7, fta: 14, oreb: 2, dreb: 3, reb: 5, ast: 1, pf: 3, fd: 7, eff: 2 });
    expect(t.players[0].derived).toEqual([]); // havia coluna 2P explícita: nada derivado
    expect(teamStat(t, "pts")).toBe(43);
    expect(d.periods.reduce((a, p) => a + (p.home ?? 0), 0)).toBe(43);
    expect(validateProStats(d, { names: MATOSINHOS }).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("deriva 2P a partir de FGM-A e 3PM-A quando não há coluna de 2P", () => {
    const { line, derived } = rowToStatLine({ "FGM-A": "5-11", "3PM-A": "2-6", "FTM-A": "3-4", PTS: "15" });
    expect(line).toMatchObject({ fg2m: 3, fg2a: 5, fg3m: 2, fg3a: 6, ftm: 3, fta: 4, pts: 15 });
    expect(derived).toEqual(["fg2m", "fg2a"]);
  });

  it("valores ausentes ou ilegíveis ficam null (nunca 0)", () => {
    const { line } = rowToStatLine({ Pts: "-", Res: "", Ass: "DNP", TO: "?" });
    expect(line.pts).toBeNull();
    expect(line.reb).toBeNull();
    expect(line.ast).toBeNull();
    expect(line.tov).toBeNull();
    expect(toSeconds("9:26")).toBe(566);
  });

  it("aceita aplicações diferentes (colunas em inglês, nomes com número)", () => {
    const d = aiToProStats(AiProStatsSchema.parse({
      app: "Easy Stats", teams: [{ name: "Aroso", players: [{ name: "7 - Rui Costa", stats: { MIN: "20", PTS: "8", FG: "3/7", "3P": "1/3", FT: "1/2", REB: "4", AST: "2", STL: "1", TOV: "2", PF: "3" } }] }],
      finalScore: { Aroso: 50, Paredes: 40 },
    }), AROSO);
    const p = d.teams.home!.players[0];
    expect(p).toMatchObject({ number: 7, name: "Rui Costa" });
    expect(p.stats).toMatchObject({ secs: 1200, pts: 8, fg2m: 2, fg2a: 4, fg3m: 1, fg3a: 3, ftm: 1, fta: 2, reb: 4, oreb: null });
    expect(d.final).toEqual({ home: 50, away: null });
  });
});

describe("validações matemáticas (código, independentes da IA)", () => {
  it("deteta pontos ≠ fórmula, convertidos > tentados, ressaltos ≠ RO+RD", () => {
    const line = { ...rowToStatLine({ Pts: "12", "2P": "3/2", "3P": "1/3", LL: "2/2", RO: "1", RD: "2", Res: "4" }).line };
    const codes = validateLine(line, { path: "x", who: "Teste" }).map((i) => i.code).sort();
    expect(codes).toEqual(["made_gt_att", "points_formula", "rebounds_sum"]);
  });

  it("deteta soma individual ≠ total da equipa e parciais ≠ resultado", () => {
    const d = pocket();
    d.teams.home!.players[10].stats.pts = 13; // Orio mal lido
    d.teams.home!.players[10].stats.fg2m = 4;
    const issues = validateProStats(d, { names: AROSO });
    expect(issues.map((i) => i.code)).toContain("totals_vs_players");
    expect(issues.map((i) => i.code)).toContain("players_vs_score");
    expect(validatePeriods([{ period: 1, home: 10, away: 5 }, { period: 2, home: 10, away: 5 }], { home: 21, away: 10 }).map((i) => i.code)).toEqual(["periods_sum"]);
  });
});

describe("cruzamento das duas equipas", () => {
  it("valida quando as duas submissões são coerentes; estatística profissional prevalece sobre a manuscrita", () => {
    const players = arosoOfficialPlayers.map((p) => (p.number === 15 ? { ...p, points: 13 } : p)); // erro de leitura manuscrita
    const r = reconcile({
      game: AROSO,
      pro: [proInput(pocket())],
      official: [
        officialInput({ id: "of-a", teamSide: "home", final: [46, 20], periods: AROSO_PERIODS, players, completeness: "complete" }),
        officialInput({ id: "of-b", teamSide: "away", final: [46, 20], periods: AROSO_PERIODS }),
      ],
    });
    expect(r.status).toBe("validated");
    expect(r.publishable).toBe(true);
    expect(r.final).toMatchObject({ home: 46, away: 20 });
    const orio = r.players.find((p) => p.name === "Orio")!;
    expect(orio.stats.pts).toBe(15);
    expect(orio.sources.pts).toBe("pro:pro-1");
    const d = r.discrepancies.find((x) => x.id === `player:${orio.key}:pts`)!;
    expect(d).toMatchObject({ severity: "low", official: 13, chosen: 15, resolved: false });
    expect(r.completeness).toEqual({ home: "full", away: "none" });
    expect(r.confidence).toBeGreaterThanOrEqual(0.9); // resultado confirmado por vários documentos
  });

  it("resultado diferente entre equipas → divergência alta, não publicável; correção do admin resolve", () => {
    const base = {
      game: AROSO,
      pro: [proInput(pocket())],
      official: [officialInput({ id: "of-b", teamSide: "away" as const, final: [46, 21], periods: [[16, 6], [12, 8], [5, 7], [13, 0]] as [number, number][] })],
    };
    const r = reconcile(base);
    expect(r.status).toBe("discrepancies");
    expect(r.publishable).toBe(false);
    const fin = r.discrepancies.find((d) => d.id === "final")!;
    expect(fin).toMatchObject({ severity: "high", teamA: "46-20", teamB: "46-21", official: "46-21" });
    expect(r.discrepancies.find((d) => d.id === "period:3")!.severity).toBe("high");

    const fixed = reconcile({ ...base, overrides: { "final.away": 20, "periods.3.away": 6 } });
    expect(fixed.discrepancies.find((d) => d.id === "final")!.resolved).toBe(true);
    expect(fixed.final).toMatchObject({ home: 46, away: 20, source: "admin" });
    expect(fixed.status).toBe("validated");
    expect(fixed.publishable).toBe(true);
  });

  it("erro matemático na estatística profissional bloqueia a publicação", () => {
    const d = pocket();
    d.teams.home!.players[0].stats.pts = 13; // 2×1 + 3×3 + 0 = 11
    const r = reconcile({ game: AROSO, pro: [proInput(d)], official: [officialInput({ id: "of-b", teamSide: "away", final: [46, 20], periods: AROSO_PERIODS })] });
    expect(r.mathIssues.some((i) => i.docId === "consolidated" && i.code === "points_formula" && i.severity === "error")).toBe(true);
    expect(r.status).toBe("discrepancies");
    expect(r.publishable).toBe(false);
  });

  it("só uma equipa submeteu → pendente de submissão (mas publicável se coerente)", () => {
    const r = reconcile({ game: AROSO, pro: [proInput(pocket())], official: [officialInput({ id: "of-a", teamSide: "home", final: [46, 20], periods: AROSO_PERIODS })] });
    expect(r.teamsSubmitted).toEqual({ home: true, away: false });
    expect(r.status).toBe("pending_submission");
    expect(r.publishable).toBe(true);
  });

  it("sem documentos → pendente de submissão e não publicável", () => {
    const r = reconcile({ game: AROSO, pro: [], official: [] });
    expect(r.status).toBe("pending_submission");
    expect(r.publishable).toBe(false);
  });

  it("baixa confiança → revisão manual", () => {
    const d = pocket();
    d.aiConfidence = 0.4;
    const r = reconcile({ game: AROSO, pro: [proInput(d, { confidence: 0.4 })], official: [] });
    expect(r.status).toBe("manual_review");
    expect(r.publishable).toBe(false);
  });

  it("jogadores com nomes semelhantes são emparelhados pelo número", () => {
    const pro = pocket().teams.home!.players;
    const { pairs } = matchPlayers(pro, arosoOfficialPlayers);
    const byName = Object.fromEntries(pairs.map(([a, b]) => [a.name, b.name]));
    expect(byName["Miguel"]).toBe("Miguel");
    expect(byName["Miguel Costa"]).toBe("Miguel Costa");
    expect(byName["JOÃO"]).toBe("João");
  });

  it("jogador com pontos só na folha oficial e jogador fora da base de dados são assinalados", () => {
    const r = reconcile({
      game: AROSO,
      pro: [proInput(pocket())],
      official: [officialInput({ id: "of-a", teamSide: "home", final: [46, 20], periods: AROSO_PERIODS, players: [...arosoOfficialPlayers, { side: "home", number: 7, name: "Zé Manel", points: 2 }] })],
      known: { home: pocket().teams.home!.players.filter((p) => p.name !== "Sérgio").map((p) => ({ name: p.name, number: p.number })), away: [] },
    });
    expect(r.discrepancies.find((d) => d.label.includes("Zé Manel"))!.severity).toBe("medium");
    expect(r.players.find((p) => p.name === "Sérgio")!.inDatabase).toBe(false);
    expect(r.players.find((p) => p.name === "Orio")!.inDatabase).toBe(true);
    expect(r.notes.join(" ")).toContain("Sérgio");
    // O jogador extra faz a soma passar de 46 → erro matemático no consolidado
    expect(r.status).toBe("discrepancies");
  });

  it("estatísticas profissionais das duas equipas com valores contraditórios", () => {
    const other = pocket();
    other.teams.home!.players[10].stats.pts = 13;
    const r = reconcile({ game: AROSO, pro: [proInput(pocket()), proInput(other, { importId: "pro-2", teamSide: "away" })], official: [] });
    const d = r.discrepancies.find((x) => x.id.endsWith(":pts:pro"))!;
    expect(d).toMatchObject({ severity: "medium", teamA: 15, teamB: 13, chosen: 15 });
  });

  it("documento incompleto (sem resultado) → revisão manual", () => {
    const d = pocket();
    d.final = { home: null, away: null };
    d.teams.away = null;
    const r = reconcile({ game: AROSO, pro: [proInput(d)], official: [] });
    expect(r.final.away).toBeNull();
    expect(r.status).toBe("manual_review");
  });

  it("caminhos de correção válidos", () => {
    expect(isValidOverridePath("final.home")).toBe(true);
    expect(isValidOverridePath("periods.5.away")).toBe(true);
    expect(isValidOverridePath(`players.${playerKey("home", 15, "Orio")}.pts`)).toBe(true);
    expect(isValidOverridePath("players.home:15:orio.__proto__")).toBe(false);
    expect(isValidOverridePath("final.__proto__")).toBe(false);
  });
});

describe("aprovação e notícia a partir do consolidado", () => {
  it("payload com estatísticas completas e fonte de cada valor", () => {
    const official = [officialInput({ id: "of-a", teamSide: "home", final: [46, 20], periods: AROSO_PERIODS, players: arosoOfficialPlayers })];
    const r = reconcile({ game: AROSO, pro: [proInput(pocket())], official });
    const p = toConsolidatedApplyPayload(r, official, ["of-a", "pro-1"]);
    expect(p.final).toEqual({ home: 46, away: 20 });
    expect(p.periods).toHaveLength(4);
    expect(p.referees).toEqual(["Árbitro Um"]);
    expect(p.import_ids).toEqual(["of-a", "pro-1"]);
    const orio = p.players.find((x) => x.nome === "Orio")!;
    expect(orio).toMatchObject({ pontos: 15, dois_pontos: 5, dois_pontos_tent: 5, triplos: 1, triplos_tent: 2, lances_livres: 2, lances_livres_tent: 5, ressaltos: 1, roubos: 5, eficiencia: 15, source: "pro_stats" });
    expect(orio.value_sources.pts).toBe("pro:pro-1");
    expect(p.unattributed.home).toBe(0);
    expect(p.reconciliation.publishable).toBe(true);
  });

  it("notícia usa os box scores consolidados e o estado de validação", () => {
    const rows = pocket().teams.home!.players.map((pl) => ({
      nome: pl.name, side: "home" as const, pontos: pl.stats.pts!, triplos: pl.stats.fg3m, lances_livres: pl.stats.ftm, source: "pro_stats",
      dois_pontos: pl.stats.fg2m, dois_pontos_tent: pl.stats.fg2a, triplos_tent: pl.stats.fg3a, lances_livres_tent: pl.stats.fta,
      ressaltos: pl.stats.reb, assistencias: pl.stats.ast, roubos: pl.stats.stl, perdas: pl.stats.tov, desarmes: pl.stats.blk, eficiencia: pl.stats.eff, segundos: pl.stats.secs,
    }));
    const box = boxScoresFromDb(rows);
    expect(box).toHaveLength(1);
    const facts = buildNewsFacts({
      home: "Aroso", away: "Paredes", homeScore: 46, awayScore: 20,
      periods: AROSO_PERIODS.map(([h, a], i) => ({ periodo: i + 1, home_points: h, away_points: a })),
      players: rows, boxScores: box, validationStatus: "validado",
    });
    const text = facts.lines.join("\n");
    expect(text).toContain("Estado de validação dos dados: validado");
    expect(text).toContain("Melhores marcadores do Aroso: Orio 15 pts");
    expect(text).toContain("Mais roubos de bola: Orio (5)");
    expect(text).toContain("Não há estatísticas individuais confirmadas do Paredes");
  });

  it("regra fundamental: dados não publicáveis → notícia em rascunho", () => {
    expect(newsValidation({ status: "discrepancies", consolidated: { publishable: false } })).toMatchObject({ draft: true });
    expect(newsValidation({ status: "validated", consolidated: { publishable: true } })).toMatchObject({ draft: false });
    expect(newsValidation(null)).toMatchObject({ draft: false }); // jogos antigos: comportamento anterior
  });
});
