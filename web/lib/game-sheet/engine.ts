/**
 * Motor determinístico do boletim: reconstrói a marcha do resultado, atribui pontos
 * individuais e valida tudo matematicamente. Funções puras — correm no servidor (fonte de
 * verdade) e no browser (feedback imediato na revisão).
 *
 * Princípios:
 *  - O valor de cada lançamento vem da DIFERENÇA entre pontuações acumuladas consecutivas,
 *    nunca do total que o modelo diz.
 *  - Um lançamento só é atribuído a um jogador quando a sequência, o jogador e o tipo de
 *    lançamento são compatíveis e a leitura tem confiança suficiente (ou foi revista pelo
 *    utilizador). Caso contrário os pontos contam para a equipa como "por atribuir".
 *  - Nunca se força uma distribuição para fechar as contas.
 *  - Na folha FIBA as colunas A e B são independentes: a ordem relativa entre lançamentos
 *    das duas equipas dentro de um período NÃO é conhecida. Por isso não se calculam
 *    trocas de liderança dentro do período — só a evolução no fim de cada período.
 */
import type { SheetData, SheetEvent, SheetPlayer, Side } from "./schema";

export const MIN_ATTRIBUTION_CONFIDENCE = 0.6;
export const REGULATION_PERIODS = 4;

export type Severity = "error" | "warning" | "info";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  side?: Side;
  eventId?: string;
  playerId?: string;
}

export interface EventAnalysis {
  id: string;
  side: Side;
  seq: number;
  /** Período usado (lido ou inferido pela pontuação acumulada) */
  period: number | null;
  periodInferred: boolean;
  /** Pontos do lançamento pela diferença de acumulados (null se não determinável) */
  delta: number | null;
  /** Excluído da marcha (anulado, duplicado, regressão ou sem acumulado) */
  excluded: boolean;
  attributed: boolean;
  playerId: string | null;
  /** Motivo pelo qual não foi atribuído (linguagem simples) */
  reason: string | null;
}

export interface PlayerStat {
  playerId: string;
  side: Side;
  number: number | null;
  name: string;
  hoophubPlayerId: string | null;
  points: number;
  byPeriod: Record<number, number>;
  ftMade: number;
  fg2Made: number;
  fg3Made: number;
  fouls: number | null;
  played: boolean | null;
  /** % dos pontos da equipa — só quando a atribuição da equipa está completa */
  pctOfTeam: number | null;
}

export interface TeamStat {
  side: Side;
  name: string;
  final: number | null;
  periodsSum: number | null;
  /** Último acumulado válido da marcha */
  runningLast: number | null;
  /** Pontos por período derivados da marcha (eventos com período conhecido) */
  runningByPeriod: Record<number, number>;
  attributed: number;
  /** final − atribuídos (null se o final não for conhecido) */
  unattributed: number | null;
  completeness: "complete" | "partial" | "none";
  fouls: number | null;
  playersUsed: number | null;
  timeouts: number | null;
}

export interface PeriodRow {
  period: number;
  home: number | null;
  away: number | null;
  cumHome: number | null;
  cumAway: number | null;
  label: string;
}

export interface Analysis {
  events: EventAnalysis[];
  players: PlayerStat[];
  teams: { home: TeamStat; away: TeamStat };
  periods: PeriodRow[];
  issues: Issue[];
  status: "needs_review" | "ready_to_confirm";
  /** Pode confirmar (sem erros bloqueantes); avisos exigem reconhecimento explícito */
  canConfirm: boolean;
  requiresAcknowledgement: boolean;
  summary: {
    winner: Side | null;
    margin: number | null;
    overtime: boolean;
    /** Maior parcial (diferença num período) */
    biggestPeriod: { period: number; side: Side; margin: number } | null;
    /** Recuperação no último período regulamentar/prolongamento demonstrada pelos parciais */
    comeback: { side: Side; deficit: number; beforePeriod: number } | null;
  };
}

const SHOT_POINTS = { FT: 1, "2PT": 2, "3PT": 3 } as const;

export function periodLabel(p: number): string {
  return p <= REGULATION_PERIODS ? `${p}.º período` : `Prolongamento ${p - REGULATION_PERIODS}`;
}

function sideLabel(sheet: SheetData, side: Side): string {
  return sheet.teams[side].name || (side === "home" ? "Equipa da casa" : "Equipa visitante");
}

/** Mapa número → jogadores da equipa (pode haver números repetidos por erro de leitura). */
function rosterByNumber(players: SheetPlayer[], side: Side): Map<number, SheetPlayer[]> {
  const m = new Map<number, SheetPlayer[]>();
  for (const p of players) {
    if (p.side !== side || p.number === null) continue;
    m.set(p.number, [...(m.get(p.number) ?? []), p]);
  }
  return m;
}

/** Acumulado no fim de cada período, pelos parciais (null se algum parcial anterior faltar). */
function periodBoundaries(sheet: SheetData, side: Side): Map<number, number | null> {
  const out = new Map<number, number | null>();
  let cum: number | null = 0;
  for (const p of [...sheet.periods].sort((a, b) => a.period - b.period)) {
    const v = p[side];
    cum = cum === null || v === null ? null : cum + v;
    out.set(p.period, cum);
  }
  return out;
}

function inferPeriod(cumulative: number, boundaries: Map<number, number | null>): number | null {
  for (const [period, end] of [...boundaries.entries()].sort((a, b) => a[0] - b[0])) {
    if (end === null) return null;
    if (cumulative <= end) return period;
  }
  return null;
}

function analyzeSide(
  sheet: SheetData,
  side: Side,
  issues: Issue[],
): { events: EventAnalysis[]; runningLast: number | null } {
  const name = sideLabel(sheet, side);
  const roster = rosterByNumber(sheet.players, side);
  const otherRoster = rosterByNumber(sheet.players, side === "home" ? "away" : "home");
  const boundaries = periodBoundaries(sheet, side);

  const ordered = sheet.events
    .filter((e) => e.side === side)
    .sort((a, b) => a.seq - b.seq);

  const result: EventAnalysis[] = [];
  let prevCum = 0;
  let prevPlayer: number | null = null;
  let prevPeriod = 1;
  let lastValid: number | null = null;

  for (const e of ordered) {
    const base: EventAnalysis = {
      id: e.id, side, seq: e.seq, period: e.period, periodInferred: false,
      delta: null, excluded: false, attributed: false, playerId: null, reason: null,
    };

    if (e.voided) {
      result.push({ ...base, excluded: true, reason: "Marcado como anulado na revisão" });
      continue;
    }

    if (e.cumulative === null) {
      issues.push({
        code: "event_no_cumulative", severity: "warning", side, eventId: e.id,
        message: `${name}: há uma marcação sem pontuação acumulada legível — não entra nas contas.`,
      });
      result.push({ ...base, excluded: true, reason: "Pontuação acumulada ilegível" });
      continue;
    }

    const delta = e.cumulative - prevCum;

    if (delta === 0) {
      const dup = e.playerNumber === prevPlayer;
      issues.push({
        code: dup ? "event_duplicate" : "event_repeated_score", severity: "warning", side, eventId: e.id,
        message: dup
          ? `${name}: a pontuação ${e.cumulative} aparece duas vezes para o mesmo jogador — tratada como duplicado.`
          : `${name}: a pontuação ${e.cumulative} repete-se — pode ser uma correção ou uma leitura errada.`,
      });
      result.push({ ...base, delta: 0, excluded: true, reason: dup ? "Evento duplicado" : "Pontuação repetida" });
      continue;
    }

    if (delta < 0) {
      issues.push({
        code: "event_regression", severity: "warning", side, eventId: e.id,
        message: `${name}: a marcha desce de ${prevCum} para ${e.cumulative} — provável leitura errada ou correção do marcador.`,
      });
      result.push({ ...base, delta, excluded: true, reason: "A pontuação desce em relação à anterior" });
      continue;
    }

    // Período: lido ou inferido pelos parciais
    let period = e.period;
    let periodInferred = false;
    if (period === null) {
      period = inferPeriod(e.cumulative, boundaries);
      periodInferred = period !== null;
    } else if (period < prevPeriod) {
      issues.push({
        code: "event_period_order", severity: "warning", side, eventId: e.id,
        message: `${name}: a marcação ${e.cumulative} está no ${periodLabel(period)}, depois de marcações de um período posterior.`,
      });
    }
    if (period !== null) prevPeriod = Math.max(prevPeriod, period);

    const analysis: EventAnalysis = { ...base, period, periodInferred, delta };
    prevCum = e.cumulative;
    prevPlayer = e.playerNumber;
    lastValid = e.cumulative;

    // ── Atribuição individual ──
    const reasons: string[] = [];
    if (delta > 3) {
      reasons.push(`salto de ${delta} pontos (faltam marcações entre ${e.cumulative - delta} e ${e.cumulative})`);
      issues.push({
        code: "event_gap", severity: "warning", side, eventId: e.id,
        message: `${name}: a marcha salta de ${e.cumulative - delta} para ${e.cumulative} (+${delta}) — faltam marcações; esses pontos ficam por atribuir.`,
      });
    }
    if (e.points !== null && e.points !== delta && delta <= 3) {
      reasons.push(`valor lido (${e.points}) não coincide com a diferença do acumulado (${delta})`);
      issues.push({
        code: "event_points_mismatch", severity: "warning", side, eventId: e.id,
        message: `${name}: na marcação ${e.cumulative} o lançamento parece valer ${e.points}, mas o acumulado subiu ${delta}.`,
      });
    }
    if (e.shotType !== null && SHOT_POINTS[e.shotType] !== delta && delta <= 3) {
      reasons.push(`tipo de lançamento (${e.shotType}) incompatível com +${delta}`);
      issues.push({
        code: "event_shot_mismatch", severity: "warning", side, eventId: e.id,
        message: `${name}: na marcação ${e.cumulative} o tipo ${e.shotType} não é compatível com +${delta}.`,
      });
    }

    let player: SheetPlayer | null = null;
    if (e.playerNumber === null) {
      reasons.push("número do jogador ilegível");
    } else {
      const candidates = roster.get(e.playerNumber) ?? [];
      if (candidates.length === 1) {
        player = candidates[0];
      } else if (candidates.length > 1) {
        reasons.push(`número ${e.playerNumber} repetido no plantel`);
      } else {
        reasons.push(`número ${e.playerNumber} não está no plantel`);
        const inOther = otherRoster.has(e.playerNumber);
        issues.push({
          code: inOther ? "event_player_other_team" : "event_player_unknown", severity: "warning", side, eventId: e.id,
          message: inOther
            ? `${name}: o n.º ${e.playerNumber} só existe no plantel adversário — verifique a equipa desta marcação.`
            : `${name}: o n.º ${e.playerNumber} não aparece no plantel lido.`,
        });
      }
    }

    if (!e.userVerified && (e.confidence === null || e.confidence < MIN_ATTRIBUTION_CONFIDENCE)) {
      reasons.push("leitura com baixa confiança");
    }

    if (reasons.length === 0 && player) {
      analysis.attributed = true;
      analysis.playerId = player.id;
    } else {
      analysis.reason = reasons.join("; ");
      analysis.playerId = player?.id ?? null;
    }
    result.push(analysis);
  }

  const lowConf = result.filter((r) => r.reason?.includes("baixa confiança")).length;
  if (lowConf > 0) {
    issues.push({
      code: "events_low_confidence", severity: "warning", side,
      message: `${name}: ${lowConf} marcação(ões) com leitura duvidosa — confirme-as para atribuir os pontos.`,
    });
  }

  return { events: result, runningLast: lastValid };
}

function sumOrNull(values: (number | null)[]): number | null {
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0);
}

export function analyzeSheet(sheet: SheetData): Analysis {
  const issues: Issue[] = [];
  const periods = [...sheet.periods].sort((a, b) => a.period - b.period);

  const home = analyzeSide(sheet, "home", issues);
  const away = analyzeSide(sheet, "away", issues);
  const events = [...home.events, ...away.events];

  // ── Estatísticas individuais (só eventos atribuídos) ──
  const playerStats = new Map<string, PlayerStat>();
  for (const p of sheet.players) {
    playerStats.set(p.id, {
      playerId: p.id, side: p.side, number: p.number, name: p.name,
      hoophubPlayerId: p.hoophubPlayerId, points: 0, byPeriod: {},
      ftMade: 0, fg2Made: 0, fg3Made: 0, fouls: p.fouls, played: p.played, pctOfTeam: null,
    });
  }
  for (const ev of events) {
    if (!ev.attributed || !ev.playerId || ev.delta === null) continue;
    const ps = playerStats.get(ev.playerId)!;
    ps.points += ev.delta;
    if (ev.period !== null) ps.byPeriod[ev.period] = (ps.byPeriod[ev.period] ?? 0) + ev.delta;
    if (ev.delta === 1) ps.ftMade++;
    else if (ev.delta === 2) ps.fg2Made++;
    else if (ev.delta === 3) ps.fg3Made++;
  }

  // ── Equipas ──
  const buildTeam = (side: Side, runningLast: number | null, sideEvents: EventAnalysis[]): TeamStat => {
    const final = sheet.final[side];
    const periodsSum = periods.length ? sumOrNull(periods.map((p) => p[side])) : null;
    const attributed = sideEvents.filter((e) => e.attributed).reduce((a, e) => a + (e.delta ?? 0), 0);
    const runningByPeriod: Record<number, number> = {};
    for (const e of sideEvents) {
      if (e.excluded || e.delta === null || e.period === null) continue;
      runningByPeriod[e.period] = (runningByPeriod[e.period] ?? 0) + e.delta;
    }
    const unattributed = final === null ? null : final - attributed;
    const fouls = sheet.players.filter((p) => p.side === side);
    const foulsKnown = fouls.length > 0 && fouls.every((p) => p.fouls !== null);
    const usedKnown = fouls.length > 0 && fouls.every((p) => p.played !== null);
    const to = sheet.timeouts.find((t) => t.side === side);
    return {
      side, name: sideLabel(sheet, side), final, periodsSum, runningLast, runningByPeriod,
      attributed, unattributed,
      completeness: final !== null && unattributed === 0 ? "complete" : attributed > 0 ? "partial" : "none",
      fouls: foulsKnown ? fouls.reduce((a, p) => a + (p.fouls ?? 0), 0) : null,
      playersUsed: usedKnown ? fouls.filter((p) => p.played).length : null,
      timeouts: to ? to.count : null,
    };
  };
  const teams = {
    home: buildTeam("home", home.runningLast, home.events),
    away: buildTeam("away", away.runningLast, away.events),
  };

  for (const t of Object.values(teams)) {
    if (t.completeness !== "complete") continue;
    for (const ps of playerStats.values()) {
      if (ps.side === t.side && t.final) ps.pctOfTeam = Math.round((ps.points / t.final) * 1000) / 10;
    }
  }

  // ── Validações de resultado ──
  for (const t of Object.values(teams)) {
    if (t.final === null) {
      issues.push({ code: "final_missing", severity: "error", side: t.side, message: `${t.name}: falta o resultado final.` });
      continue;
    }
    if (periods.length > 0) {
      if (t.periodsSum === null) {
        issues.push({ code: "periods_incomplete", severity: "warning", side: t.side, message: `${t.name}: há parciais por preencher.` });
      } else if (t.periodsSum !== t.final) {
        issues.push({
          code: "periods_sum_mismatch", severity: "error", side: t.side,
          message: `${t.name}: a soma dos parciais (${t.periodsSum}) não coincide com o resultado final (${t.final}).`,
        });
      }
    }
    if (t.runningLast !== null) {
      if (t.runningLast > t.final) {
        issues.push({
          code: "running_exceeds_final", severity: "error", side: t.side,
          message: `${t.name}: a marcha do resultado chega a ${t.runningLast}, acima do resultado final (${t.final}).`,
        });
      } else if (t.runningLast < t.final) {
        issues.push({
          code: "running_incomplete", severity: "warning", side: t.side,
          message: `${t.name}: a marcha lida termina em ${t.runningLast}, abaixo do final (${t.final}) — há marcações por ler; ${t.final - t.runningLast} pontos ficam por atribuir.`,
        });
      }
    }
    if (t.attributed > t.final) {
      issues.push({
        code: "attributed_exceeds_final", severity: "error", side: t.side,
        message: `${t.name}: os pontos atribuídos aos jogadores (${t.attributed}) excedem o resultado da equipa (${t.final}).`,
      });
    } else if (t.unattributed !== null && t.unattributed > 0) {
      issues.push({
        code: "points_unattributed", severity: "info", side: t.side,
        message: `${t.name}: ${t.unattributed} ponto(s) ainda por atribuir a jogadores.`,
      });
    }

    // Marcha vs parciais, período a período
    const bounds = periodBoundaries(sheet, t.side);
    const sideEvents = events.filter((e) => e.side === t.side && !e.excluded && e.period !== null && !e.periodInferred);
    for (const [period, end] of bounds) {
      if (end === null) continue;
      const evs = sideEvents.filter((e) => e.period === period);
      if (evs.length === 0) continue;
      const last = sheet.events.find((x) => x.id === evs[evs.length - 1].id)?.cumulative ?? null;
      const laterExists = sideEvents.some((e) => (e.period ?? 0) > period);
      if (last !== null && last > end) {
        issues.push({
          code: "running_period_mismatch", severity: "warning", side: t.side,
          message: `${t.name}: no ${periodLabel(period)} a marcha chega a ${last}, mas os parciais dão ${end} no fim do período.`,
        });
      } else if (last !== null && last < end && laterExists) {
        issues.push({
          code: "running_period_short", severity: "warning", side: t.side,
          message: `${t.name}: no ${periodLabel(period)} a marcha termina em ${last}, mas os parciais dão ${end} — falta ler marcações desse período.`,
        });
      }
    }
  }

  if (teams.home.final !== null && teams.home.final === teams.away.final) {
    issues.push({ code: "final_tied", severity: "error", message: "Um jogo de basquetebol não pode terminar empatado — verifique o resultado final." });
  }

  // Prolongamento: só se o tempo regulamentar terminou empatado
  const regulation = periods.filter((p) => p.period <= REGULATION_PERIODS);
  const ot = periods.filter((p) => p.period > REGULATION_PERIODS);
  if (ot.length > 0 && regulation.length === REGULATION_PERIODS) {
    const rh = sumOrNull(regulation.map((p) => p.home));
    const ra = sumOrNull(regulation.map((p) => p.away));
    if (rh !== null && ra !== null && rh !== ra) {
      issues.push({
        code: "overtime_without_tie", severity: "warning",
        message: `Há prolongamento, mas o tempo regulamentar terminou ${rh}–${ra} (sem empate).`,
      });
    }
  }

  // Plantéis
  for (const side of ["home", "away"] as const) {
    for (const [num, list] of rosterByNumber(sheet.players, side)) {
      if (list.length > 1) {
        issues.push({
          code: "roster_duplicate_number", severity: "warning", side,
          message: `${sideLabel(sheet, side)}: o n.º ${num} aparece em ${list.length} jogadores.`,
        });
      }
    }
  }
  for (const p of sheet.players) {
    if (p.fouls !== null && p.fouls > 5) {
      issues.push({
        code: "player_fouls_over_limit", severity: "warning", side: p.side, playerId: p.id,
        message: `${p.name || `N.º ${p.number}`}: ${p.fouls} faltas pessoais (máximo regulamentar é 5).`,
      });
    }
    if (!p.name.trim()) {
      issues.push({
        code: "player_name_missing", severity: "warning", side: p.side, playerId: p.id,
        message: `${sideLabel(sheet, p.side)}: jogador n.º ${p.number ?? "?"} sem nome legível.`,
      });
    }
  }

  // ── Linhas de períodos + resumo ──
  let ch: number | null = 0;
  let ca: number | null = 0;
  const periodRows: PeriodRow[] = periods.map((p) => {
    ch = ch === null || p.home === null ? null : ch + p.home;
    ca = ca === null || p.away === null ? null : ca + p.away;
    return { period: p.period, home: p.home, away: p.away, cumHome: ch, cumAway: ca, label: periodLabel(p.period) };
  });

  let biggestPeriod: Analysis["summary"]["biggestPeriod"] = null;
  for (const r of periodRows) {
    if (r.home === null || r.away === null || r.home === r.away) continue;
    const margin = Math.abs(r.home - r.away);
    if (!biggestPeriod || margin > biggestPeriod.margin) {
      biggestPeriod = { period: r.period, side: r.home > r.away ? "home" : "away", margin };
    }
  }

  const fh = teams.home.final;
  const fa = teams.away.final;
  const winner: Side | null = fh === null || fa === null || fh === fa ? null : fh > fa ? "home" : "away";

  // Recuperação: vencedor estava atrás no fim do penúltimo período e ganhou o último
  let comeback: Analysis["summary"]["comeback"] = null;
  if (winner && periodRows.length >= 2) {
    const before = periodRows[periodRows.length - 2];
    if (before.cumHome !== null && before.cumAway !== null) {
      const diff = winner === "home" ? before.cumAway - before.cumHome : before.cumHome - before.cumAway;
      if (diff > 0) comeback = { side: winner, deficit: diff, beforePeriod: periodRows[periodRows.length - 1].period };
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return {
    events,
    players: [...playerStats.values()],
    teams,
    periods: periodRows,
    issues,
    status: errors === 0 && warnings === 0 ? "ready_to_confirm" : "needs_review",
    canConfirm: errors === 0,
    requiresAcknowledgement: errors === 0 && warnings > 0,
    summary: {
      winner,
      margin: fh !== null && fa !== null ? Math.abs(fh - fa) : null,
      overtime: ot.length > 0,
      biggestPeriod,
      comeback,
    },
  };
}

/** Eventos cuja leitura merece segunda análise visual (com região identificada). */
export function doubtfulEvents(sheet: SheetData, analysis: Analysis): SheetEvent[] {
  const flagged = new Set(
    analysis.events.filter((e) => !e.attributed && !e.excluded && e.reason).map((e) => e.id),
  );
  for (const i of analysis.issues) if (i.eventId) flagged.add(i.eventId);
  return sheet.events.filter((e) => flagged.has(e.id) && e.region && !e.userVerified && !e.voided);
}

// ── Saídas para persistência ─────────────────────────────────────────────────

/** Formato legado de extraction_raw (compatível com aprovação / notícia já existentes). */
export function toLegacyExtraction(sheet: SheetData, analysis: Analysis) {
  const toEquipa = (s: Side) => (s === "home" ? "casa" : "fora");
  return {
    ok: true,
    schema_version: sheet.schemaVersion,
    equipa_casa: sheet.teams.home.name,
    equipa_fora: sheet.teams.away.name,
    pontos_casa: sheet.final.home,
    pontos_fora: sheet.final.away,
    parciais: sheet.periods
      .filter((p) => p.home !== null && p.away !== null)
      .map((p) => ({ periodo: p.period, casa: p.home!, fora: p.away! })),
    prolongamento: analysis.summary.overtime,
    arbitros: sheet.officials.referees,
    jogadores: analysis.players.map((p) => ({
      equipa: toEquipa(p.side),
      numero: p.number,
      nome: p.name || `N.º ${p.number ?? "?"}`,
      // Só pontos confirmados pela marcha — nunca estimativas
      pontos: p.points,
      triplos: p.fg3Made,
      lances_livres: p.ftMade,
      faltas: p.fouls,
    })),
    pontos_por_atribuir: {
      casa: analysis.teams.home.unattributed,
      fora: analysis.teams.away.unattributed,
    },
    confianca: sheet.aiConfidence,
    avisos: analysis.issues.filter((i) => i.severity !== "info").map((i) => i.message),
  };
}

/** Payload para a função transacional liga_apply_game_sheet (migração 111). */
export function toApplyPayload(sheet: SheetData, analysis: Analysis) {
  const statsSource = analysis.events.length > 0 ? "game_sheet" : "manual";
  return {
    final: { home: sheet.final.home, away: sheet.final.away },
    overtime: analysis.summary.overtime,
    referees: sheet.officials.referees,
    unattributed: { home: analysis.teams.home.unattributed, away: analysis.teams.away.unattributed },
    completeness:
      analysis.teams.home.completeness === "complete" && analysis.teams.away.completeness === "complete"
        ? "complete"
        : analysis.teams.home.completeness === "none" && analysis.teams.away.completeness === "none"
          ? "none"
          : "partial",
    periods: sheet.periods
      .filter((p) => p.home !== null && p.away !== null)
      .map((p) => ({ periodo: p.period, home_points: p.home, away_points: p.away })),
    players: analysis.players.map((p) => ({
      side: p.side,
      numero: p.number,
      nome: p.name || `N.º ${p.number ?? "?"}`,
      pontos: p.points,
      dois_pontos: p.fg2Made,
      triplos: p.fg3Made,
      lances_livres: p.ftMade,
      faltas: p.fouls ?? 0,
      pontos_periodo: p.byPeriod,
      player_id: p.hoophubPlayerId,
      source: statsSource,
    })),
    scoring_events: analysis.events
      .filter((e) => !e.excluded && e.delta !== null)
      .map((e) => {
        const raw = sheet.events.find((x) => x.id === e.id)!;
        const player = e.attributed ? analysis.players.find((p) => p.playerId === e.playerId) : undefined;
        return {
          side: e.side,
          seq: e.seq,
          periodo: e.period,
          cumulative: raw.cumulative,
          points: e.delta,
          numero: e.attributed ? raw.playerNumber : null,
          player_name: player ? player.name : null,
          attributed: e.attributed,
        };
      }),
  };
}
