/**
 * Cruzamento e consolidação das submissões das duas equipas (funções puras).
 *
 * Fontes por jogo: folhas oficiais (manuscritas, lidas por IA) e folhas de estatísticas
 * profissionais (Tipo B), de cada equipa (e eventuais uploads do admin).
 *
 * Regras:
 *  - Estatísticas individuais: estatística profissional = FONTE PRIORITÁRIA; folha oficial =
 *    complementar e de validação. Nunca se substitui um valor sem registar a divergência.
 *  - Resultado e parciais: cada documento "vota"; vence o valor com mais apoio (empate → folha
 *    oficial). QUALQUER diferença no resultado/parciais é divergência relevante (alta).
 *  - Ausência de uma estatística nunca é tratada como zero.
 *  - Correções do admin (overrides) têm a última palavra e ficam registadas como fonte "admin".
 */
import type { Analysis } from "@/lib/game-sheet/engine";
import type { SheetData } from "@/lib/game-sheet/schema";
import { emptyStatLine, proFinal, STAT_KEYS, STAT_LABELS, teamStat, type ProStatsData, type Side, type StatKey, type StatLine } from "./pro-stats-schema";
import { validateLine, validatePeriods, type MathIssue } from "./validate";

export const RECONCILIATION_VERSION = 1;
export const MIN_CONFIDENCE = 0.6;

export type ReconciliationStatus = "pending_submission" | "analyzing" | "validated" | "discrepancies" | "manual_review";
export type DiscrepancySeverity = "high" | "medium" | "low";
export type Val = number | string | null;

export interface DocRef {
  importId: string;
  /** Lado da equipa que submeteu (null = upload do admin) */
  teamSide: Side | null;
  label: string;
  confidence: number | null;
  createdAt: string;
}
export interface OfficialInput extends DocRef { docType: "official_sheet"; sheet: SheetData; analysis: Analysis }
export interface ProInput extends DocRef { docType: "pro_stats"; data: ProStatsData; issues: MathIssue[] }

export interface KnownPlayer { name: string; number: number | null; hoophubPlayerId?: string | null }

export interface ReconcileInput {
  game: { home: string; away: string };
  official: OfficialInput[];
  pro: ProInput[];
  overrides?: Record<string, Val>;
  known?: { home: KnownPlayer[]; away: KnownPlayer[] };
  ai?: AiReview | null;
}

export interface AiReview {
  notes: { id: string; reason?: string | null; suggestion?: string | null }[];
  findings: { field: string; description: string; severity: "medium" | "low"; side?: Side | null }[];
  assessment?: string | null;
  confidence?: number | null;
}

export interface Discrepancy {
  id: string;
  field: string;
  label: string;
  severity: DiscrepancySeverity;
  side?: Side;
  playerKey?: string;
  /** Valor na submissão da equipa da casa (equipa A) */
  teamA: Val;
  /** Valor na submissão da equipa visitante (equipa B) */
  teamB: Val;
  /** Valor lido na folha oficial */
  official: Val;
  /** Valor consolidado proposto/aplicado */
  chosen: Val;
  prioritySource: string;
  confidence: number | null;
  reason: string;
  suggestion: string;
  resolved: boolean;
  origin: "code" | "ai";
}

export type ValueSource = string; // "pro:<id>" | "official:<id>" | "admin"

export interface ConsolidatedPlayer {
  key: string;
  side: Side;
  number: number | null;
  name: string;
  stats: StatLine;
  sources: Partial<Record<StatKey | "name", ValueSource>>;
  confidence: number | null;
  illegible: StatKey[];
  inOfficialSheet: boolean | null;
  inDatabase: boolean | null;
  hoophubPlayerId: string | null;
}

export interface Candidate { docId: string; label: string; docType: "official_sheet" | "pro_stats"; teamSide: Side | null; home: number | null; away: number | null }

export interface ReconciliationResult {
  version: number;
  status: Exclude<ReconciliationStatus, "analyzing">;
  publishable: boolean;
  confidence: number | null;
  teamsSubmitted: { home: boolean; away: boolean };
  final: { home: number | null; away: number | null; source: string | null };
  finalCandidates: Candidate[];
  periods: { period: number; home: number | null; away: number | null; source: string | null }[];
  players: ConsolidatedPlayer[];
  totals: { home: StatLine; away: StatLine };
  completeness: { home: "full" | "points" | "partial" | "none"; away: "full" | "points" | "partial" | "none" };
  discrepancies: Discrepancy[];
  mathIssues: MathIssue[];
  usedDocs: string[];
  notes: string[];
}

// ── Utilitários ──────────────────────────────────────────────────────────────

export function normName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Semelhança entre nomes de jogador (0–1): tokens partilhados, com o 1.º nome a pesar. */
export function playerNameScore(a: string, b: string): number {
  const ta = normName(a).split(" ").filter(Boolean);
  const tb = normName(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  const sb = new Set(tb);
  const shared = ta.filter((t) => sb.has(t)).length;
  let score = shared / Math.max(ta.length, tb.length);
  if (ta[0] === tb[0]) score = Math.max(score, 0.55);
  return score;
}

export function playerKey(side: Side, number: number | null, name: string): string {
  return `${side}:${number ?? "x"}:${normName(name).replace(/ /g, "_").slice(0, 30)}`;
}

interface MatchablePlayer { number: number | null; name: string }

/** Emparelha listas de jogadores: 1.º por número, depois por nome (melhor correspondência única). */
export function matchPlayers<A extends MatchablePlayer, B extends MatchablePlayer>(a: A[], b: B[]): { pairs: [A, B][]; onlyA: A[]; onlyB: B[] } {
  const pairs: [A, B][] = [];
  const usedB = new Set<number>();
  const pendingA: A[] = [];
  for (const pa of a) {
    const idx = pa.number === null ? -1 : b.findIndex((pb, i) => !usedB.has(i) && pb.number === pa.number);
    if (idx >= 0) {
      // Número igual mas nome claramente diferente → não emparelha por número (camisola mal lida)
      const nameOk = !pa.name || !b[idx].name || /^n\.º/i.test(pa.name) || /^n\.º/i.test(b[idx].name) || playerNameScore(pa.name, b[idx].name) > 0;
      if (nameOk) { pairs.push([pa, b[idx]]); usedB.add(idx); continue; }
    }
    pendingA.push(pa);
  }
  const onlyA: A[] = [];
  for (const pa of pendingA) {
    let best = -1;
    let bestScore = 0;
    let tie = false;
    b.forEach((pb, i) => {
      if (usedB.has(i)) return;
      const s = playerNameScore(pa.name, pb.name);
      if (s > bestScore) { best = i; bestScore = s; tie = false; } else if (s === bestScore && s > 0) tie = true;
    });
    if (best >= 0 && bestScore >= 0.55 && !tie) { pairs.push([pa, b[best]]); usedB.add(best); } else onlyA.push(pa);
  }
  return { pairs, onlyA, onlyB: b.filter((_, i) => !usedB.has(i)) };
}

const fmtScore = (h: number | null, a: number | null) => (h === null || a === null ? null : `${h}-${a}`);
const sideName = (side: Side, game: { home: string; away: string }) => game[side];

interface Vote { value: string; weight: number; docs: string[]; official: boolean }

function tally(entries: { value: string | null; weight: number; docId: string; official: boolean }[]): Vote[] {
  const m = new Map<string, Vote>();
  for (const e of entries) {
    if (e.value === null) continue;
    const v = m.get(e.value) ?? { value: e.value, weight: 0, docs: [], official: false };
    v.weight += e.weight;
    v.docs.push(e.docId);
    v.official ||= e.official;
    m.set(e.value, v);
  }
  return [...m.values()].sort((x, y) => y.weight - x.weight || Number(y.official) - Number(x.official));
}

function officialPlayers(o: OfficialInput, side: Side) {
  return o.analysis.players.filter((p) => p.side === side).map((p) => ({
    number: p.number, name: p.name || (p.number !== null ? `N.º ${p.number}` : ""),
    pts: p.points, fg2m: p.fg2Made, fg3m: p.fg3Made, ftm: p.ftMade, pf: p.fouls, hoophubPlayerId: p.hoophubPlayerId,
  }));
}

// ── Reconciliação ────────────────────────────────────────────────────────────

export function reconcile(input: ReconcileInput): ReconciliationResult {
  const { game } = input;
  const overrides = input.overrides ?? {};
  const discrepancies: Discrepancy[] = [];
  const notes: string[] = [];
  const used = new Set<string>();

  const teamsSubmitted = {
    home: [...input.official, ...input.pro].some((d) => d.teamSide === "home"),
    away: [...input.official, ...input.pro].some((d) => d.teamSide === "away"),
  };

  const proErr = (p: ProInput) => p.issues.filter((i) => i.severity === "error").length;
  const officialWeight = (o: OfficialInput) => (o.analysis.canConfirm ? 1 : 0.5);
  const proWeight = (p: ProInput) => (p.issues.some((i) => i.severity === "error" && (i.code === "periods_sum" || i.code === "totals_vs_score" || i.code === "players_vs_score")) ? 0.5 : 1);

  // Melhor folha oficial (a mesma folha física pode ter sido fotografada pelas duas equipas)
  const officialSorted = [...input.official].sort((a, b) =>
    Number(b.analysis.canConfirm) - Number(a.analysis.canConfirm) || (b.confidence ?? 0) - (a.confidence ?? 0) || b.createdAt.localeCompare(a.createdAt));
  const bestOfficial = officialSorted[0] ?? null;

  // Valor que cada equipa indica: estatística profissional da equipa, senão a sua folha oficial
  const teamValue = (side: Side, get: (d: OfficialInput | ProInput) => string | null): Val => {
    const pro = input.pro.filter((p) => p.teamSide === side).map(get).find((v) => v !== null);
    if (pro !== undefined) return pro;
    const off = input.official.filter((o) => o.teamSide === side).map(get).find((v) => v !== null);
    return off ?? null;
  };
  const officialValue = (get: (d: OfficialInput) => string | null): Val => {
    const vals = [...new Set(input.official.map(get).filter((v): v is string => v !== null))];
    return vals.length === 1 ? vals[0] : vals.length > 1 ? vals.join(" / ") : null;
  };

  // ── Resultado final ──
  const finalOf = (d: OfficialInput | ProInput) =>
    d.docType === "official_sheet" ? { home: d.sheet.final.home, away: d.sheet.final.away } : proFinal(d.data);
  const finalCandidates: Candidate[] = [...input.official, ...input.pro].map((d) => ({
    docId: d.importId, label: d.label, docType: d.docType, teamSide: d.teamSide, ...finalOf(d),
  }));
  const finalVotes = tally([
    ...input.official.map((o) => ({ value: fmtScore(o.sheet.final.home, o.sheet.final.away), weight: officialWeight(o), docId: o.importId, official: true })),
    ...input.pro.map((p) => { const f = proFinal(p.data); return { value: fmtScore(f.home, f.away), weight: proWeight(p), docId: p.importId, official: false }; }),
  ]);
  let final: ReconciliationResult["final"] = { home: null, away: null, source: null };
  if (finalVotes.length) {
    const [h, a] = finalVotes[0].value.split("-").map(Number);
    final = { home: h, away: a, source: finalVotes[0].docs.map((d) => `doc:${d}`).join(",") };
    finalVotes[0].docs.forEach((d) => used.add(d));
  }
  if (finalVotes.length > 1) {
    const getF = (d: OfficialInput | ProInput) => { const f = finalOf(d); return fmtScore(f.home, f.away); };
    discrepancies.push({
      id: "final", field: "final", label: "Resultado final", severity: "high",
      teamA: teamValue("home", getF), teamB: teamValue("away", getF), official: officialValue(getF),
      chosen: fmtScore(final.home, final.away),
      prioritySource: "Folha oficial confirma o resultado; vence o valor com mais documentos concordantes",
      confidence: null,
      reason: `Os documentos indicam resultados diferentes: ${finalVotes.map((v) => `${v.value} (${v.docs.length} doc.)`).join(", ")}.`,
      suggestion: `Confirmar na folha oficial original. Proposta: ${finalVotes[0].value}${finalVotes[0].official ? " (inclui a folha oficial)" : ""}.`,
      resolved: false, origin: "code",
    });
  }

  // ── Parciais ──
  const periodNums = new Set<number>();
  input.official.forEach((o) => o.sheet.periods.forEach((p) => periodNums.add(p.period)));
  input.pro.forEach((p) => p.data.periods.forEach((x) => periodNums.add(x.period)));
  const periods: ReconciliationResult["periods"] = [];
  for (const n of [...periodNums].sort((a, b) => a - b)) {
    const offP = (o: OfficialInput) => { const p = o.sheet.periods.find((x) => x.period === n); return p ? fmtScore(p.home, p.away) : null; };
    const proP = (p: ProInput) => { const x = p.data.periods.find((y) => y.period === n); return x ? fmtScore(x.home, x.away) : null; };
    const getP = (d: OfficialInput | ProInput) => (d.docType === "official_sheet" ? offP(d) : proP(d));
    const votes = tally([
      ...input.official.map((o) => ({ value: offP(o), weight: officialWeight(o), docId: o.importId, official: true })),
      ...input.pro.map((p) => ({ value: proP(p), weight: proWeight(p), docId: p.importId, official: false })),
    ]);
    if (!votes.length) { periods.push({ period: n, home: null, away: null, source: null }); continue; }
    const [h, a] = votes[0].value.split("-").map(Number);
    periods.push({ period: n, home: h, away: a, source: votes[0].docs.map((d) => `doc:${d}`).join(",") });
    if (votes.length > 1) {
      const label = n <= 4 ? `${n}.º período` : `Prolongamento ${n - 4}`;
      discrepancies.push({
        id: `period:${n}`, field: `periods.${n}`, label: `Parcial — ${label}`, severity: "high",
        teamA: teamValue("home", getP), teamB: teamValue("away", getP), official: officialValue(offP),
        chosen: votes[0].value, prioritySource: "Valor com mais documentos concordantes (empate → folha oficial)", confidence: null,
        reason: `Parciais diferentes para o ${label}: ${votes.map((v) => `${v.value} (${v.docs.length} doc.)`).join(", ")}.`,
        suggestion: `Verificar o ${label} na folha oficial; a soma dos parciais tem de dar o resultado final.`,
        resolved: false, origin: "code",
      });
    }
  }

  // ── Jogadores ──
  const players: ConsolidatedPlayer[] = [];
  const completeness: ReconciliationResult["completeness"] = { home: "none", away: "none" };
  for (const side of ["home", "away"] as const) {
    const proDocs = input.pro
      .filter((p) => p.data.teams[side] && !p.data.teams[side]!.teamOnly && p.data.teams[side]!.players.length > 0)
      .sort((a, b) => Number(b.teamSide === side) - Number(a.teamSide === side) || proErr(a) - proErr(b) || (b.confidence ?? 0) - (a.confidence ?? 0) || b.createdAt.localeCompare(a.createdAt));
    const primary = proDocs[0] ?? null;
    const offDoc = bestOfficial;
    const offList = offDoc ? officialPlayers(offDoc, side) : [];
    const offComplete = offDoc ? offDoc.analysis.teams[side].completeness === "complete" : false;
    const teamName = sideName(side, game);

    if (primary) {
      used.add(primary.importId);
      const team = primary.data.teams[side]!;
      const primaryInconsistent = primary.issues.some((i) => i.side === side && i.severity === "error");
      for (const p of team.players) {
        const sources: ConsolidatedPlayer["sources"] = { name: `pro:${primary.importId}` };
        for (const k of STAT_KEYS) if (p.stats[k] !== null) sources[k] = `pro:${primary.importId}`;
        players.push({
          key: playerKey(side, p.number, p.name), side, number: p.number, name: p.name, stats: { ...p.stats }, sources,
          confidence: p.confidence ?? team.confidence ?? primary.confidence, illegible: p.illegible as StatKey[],
          inOfficialSheet: offList.length ? false : null, inDatabase: null, hoophubPlayerId: p.hoophubPlayerId,
        });
      }
      const mine = players.filter((x) => x.side === side);

      // Outras estatísticas profissionais com jogadores desta equipa (ex.: as duas equipas fizeram estatística)
      for (const other of proDocs.slice(1)) {
        const { pairs } = matchPlayers(mine, other.data.teams[side]!.players);
        for (const [c, o] of pairs) {
          if (o.stats.pts !== null && c.stats.pts !== null && o.stats.pts !== c.stats.pts) {
            discrepancies.push({
              id: `player:${c.key}:pts:pro`, field: `players.${c.key}.pts`, label: `Pontos — ${c.name} (${teamName})`, severity: "medium",
              side, playerKey: c.key,
              teamA: side === "home" ? c.stats.pts : o.stats.pts, teamB: side === "home" ? o.stats.pts : c.stats.pts, official: null,
              chosen: c.stats.pts, prioritySource: "Estatística profissional da própria equipa", confidence: c.confidence,
              reason: "As estatísticas profissionais das duas equipas atribuem pontos diferentes a este jogador.",
              suggestion: "Confirmar com os delegados; prevalece a estatística da própria equipa.", resolved: false, origin: "code",
            });
          }
        }
      }

      // Comparação com a folha oficial (validação)
      if (offList.length) {
        const { pairs, onlyA, onlyB } = matchPlayers(mine, offList);
        for (const [c, o] of pairs) {
          c.inOfficialSheet = true;
          if (!c.hoophubPlayerId && o.hoophubPlayerId) c.hoophubPlayerId = o.hoophubPlayerId;
          if (offComplete && c.stats.pts !== null && o.pts !== c.stats.pts) {
            discrepancies.push({
              id: `player:${c.key}:pts`, field: `players.${c.key}.pts`, label: `Pontos — ${c.name} (${teamName})`,
              severity: primaryInconsistent ? "medium" : "low", side, playerKey: c.key,
              teamA: side === "home" ? c.stats.pts : null, teamB: side === "away" ? c.stats.pts : null, official: o.pts,
              chosen: c.stats.pts, prioritySource: "Estatística profissional (prioritária sobre a folha manuscrita)", confidence: c.confidence,
              reason: `Folha oficial (leitura manuscrita): ${o.pts} pts; estatística profissional: ${c.stats.pts} pts.`,
              suggestion: primaryInconsistent
                ? "A estatística profissional tem inconsistências — confirmar na folha original antes de publicar."
                : "Manter o valor da estatística profissional (coerente com o resultado).",
              resolved: false, origin: "code",
            });
          }
          if (o.pf !== null && c.stats.pf !== null && o.pf !== c.stats.pf) {
            discrepancies.push({
              id: `player:${c.key}:pf`, field: `players.${c.key}.pf`, label: `Faltas — ${c.name} (${teamName})`, severity: "low", side, playerKey: c.key,
              teamA: side === "home" ? c.stats.pf : null, teamB: side === "away" ? c.stats.pf : null, official: o.pf, chosen: c.stats.pf,
              prioritySource: "Estatística profissional", confidence: c.confidence,
              reason: `Folha oficial: ${o.pf} faltas; estatística profissional: ${c.stats.pf}.`,
              suggestion: "As faltas oficiais são as do boletim; confirmar se for relevante para a notícia.", resolved: false, origin: "code",
            });
          }
          if (c.number === null && o.number !== null) c.number = o.number;
        }
        for (const o of onlyB) {
          if ((o.pts ?? 0) > 0) {
            const key = playerKey(side, o.number, o.name);
            players.push({
              key, side, number: o.number, name: o.name, stats: { ...emptyStatLine(), pts: o.pts, fg2m: o.fg2m, fg3m: o.fg3m, ftm: o.ftm, pf: o.pf },
              sources: { name: `official:${offDoc!.importId}`, pts: `official:${offDoc!.importId}` }, confidence: offDoc!.confidence,
              illegible: [], inOfficialSheet: true, inDatabase: null, hoophubPlayerId: o.hoophubPlayerId ?? null,
            });
            discrepancies.push({
              id: `player:${key}:missing_pro`, field: `players.${key}`, label: `Jogador só na folha oficial — ${o.name} (${teamName})`, severity: "medium", side, playerKey: key,
              teamA: null, teamB: null, official: o.pts, chosen: o.pts, prioritySource: "Folha oficial (única fonte para este jogador)", confidence: offDoc!.confidence,
              reason: `A folha oficial atribui ${o.pts} pts a ${o.name}${o.number !== null ? ` (#${o.number})` : ""}, que não aparece nas estatísticas profissionais.`,
              suggestion: "Verificar se é o mesmo jogador com outro nome/número (corrigir) ou uma leitura errada da folha.", resolved: false, origin: "code",
            });
          }
        }
        // Folha oficial com poucos jogadores lidos (incompleta/ilegível): um aviso único em vez de um por jogador
        const officialPartial = offList.length < Math.ceil(mine.length / 2);
        if (officialPartial && onlyA.length) {
          notes.push(`${teamName}: a folha oficial só tem ${offList.length} jogador(es) lido(s) — ${onlyA.length} jogador(es) da estatística profissional não foram confirmados na folha.`);
        }
        for (const c of officialPartial ? [] : onlyA) {
          discrepancies.push({
            id: `player:${c.key}:not_official`, field: `players.${c.key}.name`, label: `Jogador não identificado na folha oficial — ${c.name} (${teamName})`,
            severity: "low", side, playerKey: c.key, teamA: side === "home" ? c.name : null, teamB: side === "away" ? c.name : null,
            official: null, chosen: c.name, prioritySource: "Estatística profissional", confidence: c.confidence,
            reason: "Não foi possível associar este jogador a nenhuma linha da folha oficial (nome/número diferente ou ilegível).",
            suggestion: "Confirmar a identidade do jogador e corrigir o nome/número se necessário.", resolved: false, origin: "code",
          });
        }
      }
      const full = mine.length > 0 && mine.every((p) => p.stats.pts !== null) && mine.some((p) => p.stats.reb !== null || p.stats.ast !== null);
      completeness[side] = full ? "full" : mine.every((p) => p.stats.pts !== null) ? "points" : "partial";
    } else if (offDoc && offList.length) {
      used.add(offDoc.importId);
      for (const o of offList) {
        players.push({
          key: playerKey(side, o.number, o.name), side, number: o.number, name: o.name,
          stats: { ...emptyStatLine(), pts: o.pts, fg2m: o.fg2m, fg3m: o.fg3m, ftm: o.ftm, pf: o.pf },
          sources: { name: `official:${offDoc.importId}`, pts: `official:${offDoc.importId}`, pf: `official:${offDoc.importId}` },
          confidence: offDoc.confidence, illegible: [], inOfficialSheet: true, inDatabase: null, hoophubPlayerId: o.hoophubPlayerId ?? null,
        });
      }
      completeness[side] = offComplete ? "points" : offDoc.analysis.teams[side].completeness === "none" ? "none" : "partial";
    }

    // Estatística profissional só com linha de equipa (ex.: adversário sem estatística individual)
    const teamOnly = input.pro.find((p) => p.data.teams[side]?.teamOnly);
    if (teamOnly && completeness[side] === "none") notes.push(`${teamName}: a estatística profissional só tem totais de equipa (sem estatística individual).`);
  }

  // ── Jogadores na base de dados ──
  for (const p of players) {
    const known = input.known?.[p.side];
    if (!known || known.length === 0) continue;
    const hit = known.find((k) => (k.number !== null && k.number === p.number && playerNameScore(k.name, p.name) >= 0.5))
      ?? known.find((k) => playerNameScore(k.name, p.name) >= 0.85);
    p.inDatabase = Boolean(hit);
    if (hit?.hoophubPlayerId && !p.hoophubPlayerId) p.hoophubPlayerId = hit.hoophubPlayerId;
  }
  const unknownPlayers = players.filter((p) => p.inDatabase === false);
  if (unknownPlayers.length) notes.push(`Jogadores que não constam da base de dados: ${unknownPlayers.map((p) => `${p.name} (${sideName(p.side, game)})`).join(", ")}.`);

  // ── Correções do admin ──
  const applied = applyOverrides({ final, periods, players }, overrides);
  for (const d of discrepancies) {
    const hit = Object.keys(overrides).find((path) => path === d.field || path.startsWith(`${d.field}.`) || (d.playerKey && path.startsWith(`players.${d.playerKey}.`) && d.field.startsWith(`players.${d.playerKey}`)));
    if (hit) {
      d.resolved = true;
      d.chosen = d.field === "final" ? fmtScore(final.home, final.away)
        : d.field.startsWith("periods.") ? (() => { const p = periods.find((x) => `periods.${x.period}` === d.field); return p ? fmtScore(p.home, p.away) : d.chosen; })()
        : overrides[hit] ?? d.chosen;
    }
  }
  // Divergências resolvidas manualmente (decisão do admin sem alterar valores)
  for (const path of Object.keys(overrides)) {
    if (!path.startsWith("resolve.")) continue;
    const d = discrepancies.find((x) => x.id === path.slice(8));
    if (d) d.resolved = true;
  }
  if (applied.length) notes.push(`Correções manuais aplicadas: ${applied.length}.`);

  // ── Análise cruzada DeepSeek (texto explicativo; não altera valores) ──
  if (input.ai) {
    for (const n of input.ai.notes) {
      const d = discrepancies.find((x) => x.id === n.id);
      if (!d) continue;
      if (n.reason) d.reason = `${d.reason} IA: ${n.reason}`.slice(0, 600);
      if (n.suggestion) d.suggestion = n.suggestion.slice(0, 400);
    }
    input.ai.findings.slice(0, 10).forEach((f, i) => {
      discrepancies.push({
        id: `ai:${i}`, field: f.field.slice(0, 80), label: `Análise IA — ${f.field.slice(0, 60)}`, severity: f.severity === "medium" ? "medium" : "low",
        side: f.side ?? undefined, teamA: null, teamB: null, official: null, chosen: null, prioritySource: "Análise cruzada (informativa)",
        confidence: input.ai!.confidence ?? null, reason: f.description.slice(0, 500), suggestion: "Rever manualmente.",
        resolved: Boolean(overrides[`resolve.ai:${i}`] !== undefined), origin: "ai",
      });
    });
  }

  // ── Validações matemáticas do consolidado (código) ──
  const mathIssues: MathIssue[] = [];
  mathIssues.push(...validatePeriods(periods, final, { docId: "consolidated", names: game }));
  for (const p of players) {
    const iss = validateLine(p.stats, { path: `players.${p.key}`, who: `${p.name} (${sideName(p.side, game)})`, side: p.side, playerId: p.key, docId: "consolidated" });
    const adminTouched = Object.values(p.sources).includes("admin");
    mathIssues.push(...iss.map((i) => (adminTouched ? { ...i, severity: "warning" as const, message: `${i.message} (inclui valor corrigido pelo admin)` } : i)));
  }
  const totals = { home: emptyStatLine(), away: emptyStatLine() };
  for (const side of ["home", "away"] as const) {
    const mine = players.filter((p) => p.side === side);
    for (const k of STAT_KEYS) {
      if (k === "pm") continue;
      totals[side][k] = mine.length && mine.every((p) => p.stats[k] !== null) ? mine.reduce((s, p) => s + (p.stats[k] ?? 0), 0) : null;
    }
    if (completeness[side] === "full" || completeness[side] === "points") {
      if (totals[side].pts !== null && final[side] !== null && totals[side].pts !== final[side]) {
        mathIssues.push({ code: "players_vs_score", severity: "error", path: `players.${side}.pts`, side, docId: "consolidated",
          message: `${sideName(side, game)}: soma dos pontos individuais (${totals[side].pts}) ≠ resultado (${final[side]}).`, expected: final[side], actual: totals[side].pts });
      }
    }
    // Totais da estatística profissional (linha de equipa) vs resultado consolidado
    const tp = input.pro.find((p) => p.data.teams[side] && teamStat(p.data.teams[side]!, "pts") !== null);
    if (tp && final[side] !== null) {
      const v = teamStat(tp.data.teams[side]!, "pts");
      if (v !== final[side]) {
        mathIssues.push({ code: "totals_vs_score", severity: "error", path: `${side}.totals.pts`, side, docId: tp.importId,
          message: `${sideName(side, game)}: total de pontos na estatística profissional (${v}) ≠ resultado consolidado (${final[side]}).`, expected: final[side], actual: v });
      }
    }
  }
  // Problemas dos documentos individuais (informativos — o bloqueio é decidido pelo consolidado)
  for (const p of input.pro) mathIssues.push(...p.issues.map((i) => ({ ...i, docId: p.importId, severity: "warning" as const })));

  // ── Confiança ──
  const usedConf = [...input.official, ...input.pro].filter((d) => used.has(d.importId)).map((d) => d.confidence ?? 0.75);
  let confidence: number | null = usedConf.length ? Math.min(...usedConf) : null;
  if (confidence !== null && finalVotes[0] && finalVotes[0].docs.length >= 2 && finalVotes.length === 1) confidence = Math.max(confidence, 0.9);
  if (confidence !== null) confidence = Math.round(confidence * 1000) / 1000;

  // ── Estado ──
  const noDocs = input.official.length + input.pro.length === 0;
  const unresolvedHigh = discrepancies.some((d) => d.severity === "high" && !d.resolved);
  const blockingMath = mathIssues.some((i) => i.severity === "error" && (i.docId === "consolidated" || i.code === "totals_vs_score"));
  const illegibleKey = players.some((p) => p.illegible.includes("pts") && p.sources.pts !== "admin");
  const adminFixedFinal = overrides["final.home"] !== undefined || overrides["final.away"] !== undefined;
  const lowConfidence = confidence !== null && confidence < MIN_CONFIDENCE && !adminFixedFinal;

  let status: ReconciliationResult["status"];
  if (noDocs) status = "pending_submission";
  else if (unresolvedHigh || blockingMath) status = "discrepancies";
  else if (final.home === null || final.away === null || lowConfidence || illegibleKey) status = "manual_review";
  else if (!teamsSubmitted.home || !teamsSubmitted.away) status = "pending_submission";
  else status = "validated";

  const publishable = !noDocs && final.home !== null && final.away !== null && !unresolvedHigh && !blockingMath && !lowConfidence && !illegibleKey;
  if (lowConfidence) notes.push(`Confiança da interpretação baixa (${Math.round((confidence ?? 0) * 100)}%).`);
  if (illegibleKey) notes.push("Há pontos individuais ilegíveis na estatística profissional.");

  return {
    version: RECONCILIATION_VERSION, status, publishable, confidence, teamsSubmitted, final, finalCandidates, periods,
    players, totals, completeness, discrepancies, mathIssues, usedDocs: [...used], notes,
  };
}

/** Aplica as correções do admin (mutável sobre os objetos consolidados). Devolve os caminhos aplicados. */
export function applyOverrides(
  target: { final: ReconciliationResult["final"]; periods: ReconciliationResult["periods"]; players: ConsolidatedPlayer[] },
  overrides: Record<string, Val>,
): string[] {
  const applied: string[] = [];
  const num = (v: Val) => (v === null ? null : typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null);
  for (const [path, value] of Object.entries(overrides)) {
    const parts = path.split(".");
    if (parts[0] === "final" && (parts[1] === "home" || parts[1] === "away")) {
      target.final[parts[1]] = num(value);
      target.final.source = "admin";
      applied.push(path);
    } else if (parts[0] === "periods" && (parts[2] === "home" || parts[2] === "away")) {
      const n = Number(parts[1]);
      let p = target.periods.find((x) => x.period === n);
      if (!p && n >= 1 && n <= 10) { p = { period: n, home: null, away: null, source: null }; target.periods.push(p); target.periods.sort((a, b) => a.period - b.period); }
      if (p) { p[parts[2] as Side] = num(value); p.source = "admin"; applied.push(path); }
    } else if (parts[0] === "players" && parts.length === 3) {
      const pl = target.players.find((x) => x.key === parts[1]);
      if (!pl) continue;
      const field = parts[2];
      if (field === "name" && typeof value === "string") { pl.name = value.slice(0, 200); pl.sources.name = "admin"; applied.push(path); }
      else if (field === "number") { const n = num(value); pl.number = n !== null && n >= 0 && n <= 99 ? n : null; applied.push(path); }
      else if ((STAT_KEYS as readonly string[]).includes(field)) {
        pl.stats[field as StatKey] = num(value);
        pl.sources[field as StatKey] = "admin";
        pl.illegible = pl.illegible.filter((k) => k !== field);
        applied.push(path);
      }
    }
  }
  return applied;
}

/** Caminhos editáveis pelo admin (validação do pedido de correção). */
export function isValidOverridePath(path: string): boolean {
  if (/^final\.(home|away)$/.test(path)) return true;
  if (/^periods\.([1-9]|10)\.(home|away)$/.test(path)) return true;
  if (/^resolve\.[\w:.\-]{1,120}$/.test(path)) return true;
  const m = /^players\.((?:home|away):[\w]+:[\w]*)\.(\w+)$/.exec(path);
  return Boolean(m && (m[2] === "name" || m[2] === "number" || (STAT_KEYS as readonly string[]).includes(m[2])));
}

/** Rótulo legível de um caminho (registo de correções). */
export function pathLabel(path: string, result?: ReconciliationResult | null): string {
  const parts = path.split(".");
  if (parts[0] === "final") return `Resultado final (${parts[1] === "home" ? "casa" : "fora"})`;
  if (parts[0] === "periods") return `Parcial P${parts[1]} (${parts[2] === "home" ? "casa" : "fora"})`;
  if (parts[0] === "resolve") return `Divergência marcada como resolvida (${parts.slice(1).join(".")})`;
  if (parts[0] === "players") {
    const pl = result?.players.find((p) => p.key === parts[1]);
    const what = parts[2] === "name" ? "Nome" : parts[2] === "number" ? "Número" : STAT_LABELS[parts[2] as StatKey] ?? parts[2];
    return `${what} — ${pl?.name ?? parts[1]}`;
  }
  return path;
}
