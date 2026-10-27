import { describe, it, expect } from "vitest";
import { analyzeSheet, doubtfulEvents, toApplyPayload, toLegacyExtraction } from "./engine";
import { emptySheetData, type SheetData, type SheetEvent, type Side } from "./schema";

// ── Construtores de cenários ──────────────────────────────────────────────────

type Shot = [number | null, 1 | 2 | 3]; // [n.º camisola, valor]

function base(home = "PowerTogether", away = "Matosinhos Basket"): SheetData {
  return emptySheetData({ home, away });
}

/** Gera a marcha (acumulados) a partir de lançamentos por período. */
function running(side: Side, perPeriod: Shot[][], opts: { confidence?: number } = {}): SheetEvent[] {
  const out: SheetEvent[] = [];
  let cum = 0;
  let seq = 0;
  perPeriod.forEach((shots, i) => {
    for (const [num, pts] of shots) {
      cum += pts;
      out.push({
        id: `${side[0]}${seq}`, side, seq: seq++, period: i + 1, cumulative: cum,
        points: pts, shotType: pts === 1 ? "FT" : pts === 2 ? "2PT" : "3PT",
        playerNumber: num, confidence: opts.confidence ?? 0.95, note: null,
        region: { x: 0.1, y: 0.1, w: 0.05, h: 0.02 }, userVerified: false, voided: false,
      });
    }
  });
  return out;
}

function roster(side: Side, numbers: number[]) {
  return numbers.map((n) => ({
    id: `${side}-${n}`, side, number: n, name: `Jogador ${side} ${n}`,
    hoophubPlayerId: null, fouls: 1, played: true, confidence: 0.9,
  }));
}

/** Distribui `total` pontos por lançamentos de 2 (+1 LL se ímpar), alternando jogadores. */
function shotsFor(total: number, players: number[]): Shot[] {
  const shots: Shot[] = [];
  let left = total;
  let i = 0;
  while (left > 0) {
    const v = left >= 2 ? 2 : 1;
    shots.push([players[i++ % players.length], v as 1 | 2]);
    left -= v;
  }
  return shots;
}

/** Caso de referência (campeonato distrital): PowerTogether 53–55 Matosinhos Basket. */
function reference(): SheetData {
  const s = base();
  const ph = [21, 11, 15, 6];
  const pa = [15, 11, 12, 17];
  s.periods = ph.map((h, i) => ({ period: i + 1, home: h, away: pa[i] }));
  s.final = { home: 53, away: 55 };
  return s;
}

/** Referência + marcha sintética coerente (jogadores fictícios — não são dados oficiais). */
function referenceWithRunning(): SheetData {
  const s = reference();
  s.players = [...roster("home", [4, 5, 7, 9]), ...roster("away", [10, 11, 12, 13])];
  s.events = [
    ...running("home", [21, 11, 15, 6].map((t) => shotsFor(t, [4, 5, 7, 9]))),
    ...running("away", [15, 11, 12, 17].map((t) => shotsFor(t, [10, 11, 12, 13]))),
  ];
  return s;
}

const codes = (s: SheetData) => analyzeSheet(s).issues.map((i) => i.code);

// ── Testes ────────────────────────────────────────────────────────────────────

describe("caso de referência 53–55 (PowerTogether vs Matosinhos Basket)", () => {
  it("parciais 21-15, 11-11, 15-12, 6-17 somam 53–55 e não há erros", () => {
    const a = analyzeSheet(reference());
    expect(a.teams.home.periodsSum).toBe(53);
    expect(a.teams.away.periodsSum).toBe(55);
    expect(a.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(a.canConfirm).toBe(true);
    expect(a.summary.winner).toBe("away");
    expect(a.summary.margin).toBe(2);
    expect(a.periods.map((p) => [p.cumHome, p.cumAway])).toEqual([[21, 15], [32, 26], [47, 38], [53, 55]]);
  });

  it("deteta a recuperação no último período apenas porque os parciais a demonstram", () => {
    const a = analyzeSheet(reference());
    expect(a.summary.comeback).toEqual({ side: "away", deficit: 9, beforePeriod: 4 });
    expect(a.summary.biggestPeriod).toEqual({ period: 4, side: "away", margin: 11 });
  });

  it("sem marcha, todos os pontos ficam por atribuir (nunca inventados)", () => {
    const a = analyzeSheet(reference());
    expect(a.teams.home.unattributed).toBe(53);
    expect(a.teams.away.unattributed).toBe(55);
    expect(a.teams.home.completeness).toBe("none");
    expect(a.players).toEqual([]);
  });
});

describe("1. boletim legível e consistente", () => {
  it("atribui todos os pontos e fica pronto a confirmar", () => {
    const a = analyzeSheet(referenceWithRunning());
    expect(a.status).toBe("ready_to_confirm");
    expect(a.teams.home.attributed).toBe(53);
    expect(a.teams.away.attributed).toBe(55);
    expect(a.teams.home.completeness).toBe("complete");
    const total = a.players.filter((p) => p.side === "home").reduce((s, p) => s + p.points, 0);
    expect(total).toBe(53);
    // estatísticas derivadas por tipo
    const p4 = a.players.find((p) => p.playerId === "home-4")!;
    expect(p4.ftMade * 1 + p4.fg2Made * 2 + p4.fg3Made * 3).toBe(p4.points);
    expect(Object.values(p4.byPeriod).reduce((x, y) => x + y, 0)).toBe(p4.points);
    expect(p4.pctOfTeam).not.toBeNull();
  });

  it("o valor do lançamento vem do acumulado, não do campo 'points' do modelo", () => {
    const s = referenceWithRunning();
    s.events[0].points = null;
    s.events[0].shotType = null;
    const a = analyzeSheet(s);
    expect(a.events.find((e) => e.id === s.events[0].id)!.attributed).toBe(true);
  });

  it("triplos contam como 3 pontos convertidos de 3", () => {
    const s = base("A", "B");
    s.players = roster("home", [7]);
    s.events = running("home", [[[7, 3], [7, 2], [7, 1]]]);
    s.periods = [{ period: 1, home: 6, away: 2 }];
    s.final = { home: 6, away: 2 };
    const p = analyzeSheet(s).players[0];
    expect([p.points, p.fg3Made, p.fg2Made, p.ftMade]).toEqual([6, 1, 1, 1]);
  });
});

describe("3. texto manuscrito ambíguo / baixa confiança", () => {
  it("não atribui leituras com baixa confiança, mas conta-as para a equipa", () => {
    const s = referenceWithRunning();
    s.events[3].confidence = 0.3;
    const a = analyzeSheet(s);
    const ev = a.events.find((e) => e.id === s.events[3].id)!;
    expect(ev.attributed).toBe(false);
    expect(ev.reason).toContain("baixa confiança");
    expect(a.teams.home.unattributed).toBe(ev.delta);
    expect(codes(s)).toContain("events_low_confidence");
    expect(a.status).toBe("needs_review");
    expect(a.canConfirm).toBe(true);
    expect(a.requiresAcknowledgement).toBe(true);
  });

  it("depois de verificado pelo utilizador é atribuído", () => {
    const s = referenceWithRunning();
    s.events[3].confidence = 0.3;
    s.events[3].userVerified = true;
    expect(analyzeSheet(s).teams.home.unattributed).toBe(0);
  });

  it("doubtfulEvents devolve só eventos duvidosos com região", () => {
    const s = referenceWithRunning();
    s.events[3].confidence = 0.3;
    const d = doubtfulEvents(s, analyzeSheet(s));
    expect(d.map((e) => e.id)).toEqual([s.events[3].id]);
  });
});

describe("4. jogador não identificado no plantel", () => {
  it("fica por atribuir e gera aviso", () => {
    const s = referenceWithRunning();
    s.events[0].playerNumber = 99;
    const a = analyzeSheet(s);
    expect(a.events[0].attributed).toBe(false);
    expect(codes(s)).toContain("event_player_unknown");
  });

  it("número que só existe na outra equipa é assinalado", () => {
    const s = referenceWithRunning();
    s.events[0].playerNumber = 10;
    expect(codes(s)).toContain("event_player_other_team");
  });
});

describe("5. pontos individuais incompletos", () => {
  it("marcha que termina abaixo do final: aviso e pontos por atribuir", () => {
    const s = referenceWithRunning();
    const homeEvents = s.events.filter((e) => e.side === "home");
    const removed = homeEvents.slice(-2);
    s.events = s.events.filter((e) => !removed.includes(e));
    const a = analyzeSheet(s);
    expect(codes(s)).toContain("running_incomplete");
    expect(a.teams.home.unattributed).toBe(removed.reduce((x, e) => x + (e.points ?? 0), 0));
    expect(a.canConfirm).toBe(true);
  });

  it("salto na marcha (> 3) fica por atribuir, sem forçar distribuição", () => {
    const s = base("A", "B");
    s.players = roster("home", [7]);
    s.events = running("home", [[[7, 2], [7, 2], [7, 2]]]);
    s.events.splice(1, 1); // 2 → 6: salto de 4
    s.periods = [{ period: 1, home: 6, away: 0 }];
    s.final = { home: 6, away: 1 };
    s.periods[0].away = 1;
    const a = analyzeSheet(s);
    expect(codes(s)).toContain("event_gap");
    expect(a.teams.home.attributed).toBe(2);
    expect(a.teams.home.unattributed).toBe(4);
  });
});

describe("6. resultado final incompatível com os parciais", () => {
  it("é erro bloqueante", () => {
    const s = reference();
    s.final.home = 54;
    const a = analyzeSheet(s);
    expect(codes(s)).toContain("periods_sum_mismatch");
    expect(a.canConfirm).toBe(false);
    expect(a.issues.find((i) => i.code === "periods_sum_mismatch")!.message).toContain("53");
  });

  it("resultado em falta é erro bloqueante", () => {
    const s = reference();
    s.final.away = null;
    expect(analyzeSheet(s).canConfirm).toBe(false);
  });

  it("empate final é erro", () => {
    const s = base("A", "B");
    s.periods = [];
    s.final = { home: 50, away: 50 };
    expect(codes(s)).toContain("final_tied");
  });
});

describe("7. pontos individuais acima do total da equipa", () => {
  it("marcha acima do final é erro bloqueante", () => {
    const s = referenceWithRunning();
    s.final.home = 51;
    s.periods[3].home = 4;
    const a = analyzeSheet(s);
    expect(codes(s)).toContain("running_exceeds_final");
    expect(codes(s)).toContain("attributed_exceeds_final");
    expect(a.canConfirm).toBe(false);
  });
});

describe("8. eventos duplicados e regressões", () => {
  it("acumulado repetido do mesmo jogador é duplicado e não conta", () => {
    const s = referenceWithRunning();
    const dup = { ...s.events[2], id: "dup", seq: s.events[2].seq };
    s.events.splice(3, 0, dup);
    // reordenar seq para manter a ordem visual
    s.events.filter((e) => e.side === "home").forEach((e, i) => (e.seq = i));
    const a = analyzeSheet(s);
    expect(codes(s)).toContain("event_duplicate");
    expect(a.teams.home.attributed).toBe(53);
  });

  it("regressão é excluída e o seguinte é calculado a partir do último válido", () => {
    const s = base("A", "B");
    s.players = roster("home", [7]);
    s.events = running("home", [[[7, 2], [7, 2], [7, 2]]]);
    s.events[1].cumulative = 1; // 2 → 1 (regressão), depois 6
    s.periods = [{ period: 1, home: 6, away: 1 }];
    s.final = { home: 6, away: 1 };
    const a = analyzeSheet(s);
    expect(codes(s)).toContain("event_regression");
    expect(a.events[2].delta).toBe(4);
    expect(a.teams.home.unattributed).toBe(4);
  });

  it("evento anulado pelo utilizador sai da marcha", () => {
    const s = base("A", "B");
    s.players = roster("home", [7]);
    s.events = running("home", [[[7, 2], [7, 2]]]);
    s.events.push({ ...s.events[1], id: "x", seq: 2, cumulative: 9, voided: true });
    s.periods = [{ period: 1, home: 4, away: 1 }];
    s.final = { home: 4, away: 1 };
    const a = analyzeSheet(s);
    expect(a.teams.home.runningLast).toBe(4);
    expect(a.status).toBe("ready_to_confirm");
  });
});

describe("9. jogo com prolongamento", () => {
  it("aceita P5 quando o tempo regulamentar terminou empatado", () => {
    const s = base("A", "B");
    s.periods = [
      { period: 1, home: 10, away: 12 }, { period: 2, home: 15, away: 13 },
      { period: 3, home: 10, away: 10 }, { period: 4, home: 15, away: 15 },
      { period: 5, home: 8, away: 5 },
    ];
    s.final = { home: 58, away: 55 };
    const a = analyzeSheet(s);
    expect(a.summary.overtime).toBe(true);
    expect(a.canConfirm).toBe(true);
    expect(codes(s)).not.toContain("overtime_without_tie");
    expect(a.periods[4].label).toBe("Prolongamento 1");
  });

  it("avisa se há prolongamento sem empate no fim do tempo regulamentar", () => {
    const s = base("A", "B");
    s.periods = [1, 2, 3, 4, 5].map((p) => ({ period: p, home: 10, away: p === 1 ? 8 : 10 }));
    s.final = { home: 50, away: 48 };
    expect(codes(s)).toContain("overtime_without_tie");
  });
});

describe("2. período inferido e ordem dos períodos", () => {
  it("infere o período pelo acumulado quando não é legível", () => {
    const s = referenceWithRunning();
    const ev = s.events.find((e) => e.side === "home" && e.cumulative === 23)!;
    ev.period = null;
    const a = analyzeSheet(s);
    const r = a.events.find((e) => e.id === ev.id)!;
    expect(r.period).toBe(2);
    expect(r.periodInferred).toBe(true);
  });

  it("marcha que ultrapassa o fim do período segundo os parciais gera aviso", () => {
    const s = referenceWithRunning();
    s.periods[0].home = 19;
    s.periods[1].home = 13;
    expect(codes(s)).toContain("running_period_mismatch");
  });
});

describe("15. correção manual", () => {
  it("corrigir o número do jogador recalcula estatísticas", () => {
    const s = referenceWithRunning();
    s.events[0].playerNumber = 99;
    expect(analyzeSheet(s).teams.home.unattributed).toBeGreaterThan(0);
    s.events[0].playerNumber = 4;
    s.events[0].userVerified = true;
    expect(analyzeSheet(s).teams.home.unattributed).toBe(0);
  });
});

describe("saídas para persistência", () => {
  it("legacy extraction só leva pontos confirmados e os pontos por atribuir", () => {
    const s = referenceWithRunning();
    s.events[0].confidence = 0.1;
    const a = analyzeSheet(s);
    const legacy = toLegacyExtraction(s, a);
    expect(legacy.pontos_casa).toBe(53);
    expect(legacy.parciais).toHaveLength(4);
    const sum = legacy.jogadores.filter((j) => j.equipa === "casa").reduce((x, j) => x + j.pontos, 0);
    expect(sum + (legacy.pontos_por_atribuir.casa ?? 0)).toBe(53);
  });

  it("payload de aplicação inclui eventos válidos e completude", () => {
    const s = referenceWithRunning();
    const p = toApplyPayload(s, analyzeSheet(s));
    expect(p.completeness).toBe("complete");
    expect(p.scoring_events.filter((e) => e.side === "home").at(-1)!.cumulative).toBe(53);
    expect(p.players.every((x) => x.source === "game_sheet")).toBe(true);
    const manual = toApplyPayload(reference(), analyzeSheet(reference()));
    expect(manual.completeness).toBe("none");
    expect(manual.scoring_events).toEqual([]);
  });
});
