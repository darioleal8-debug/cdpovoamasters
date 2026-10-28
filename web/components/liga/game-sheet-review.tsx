"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { analyzeSheet, periodLabel, type Analysis, type Issue } from "@/lib/game-sheet/engine";
import type { ImportStatus, SheetData, SheetEvent, SheetPlayer, ShotType, Side } from "@/lib/game-sheet/schema";

// ── Tipos da API ──────────────────────────────────────────────────────────────

interface ImportView {
  id: string;
  event_id: string;
  status: ImportStatus;
  model: string | null;
  sheet: SheetData | null;
  analysis_count: number;
  max_analyses: number;
  corrections: { at: string; changes: string[] }[];
  error: string | null;
  submission_id: string | null;
  confirmed_at: string | null;
  updated_at: string;
  usage: { model?: string; durationMs?: number; calls: number; secondPass?: string } | null;
  image_url: string | null;
  game: { id: string; date: string | null; home: string; away: string; isTest: boolean } | null;
  can_edit: boolean;
  is_liga_admin: boolean;
  analysis_error?: string | null;
  needs_reconfirmation?: boolean;
}

// ── Estilo (alinhado com as páginas da Liga) ─────────────────────────────────

const C = {
  bg: "#F4EFE8", card: "#FFFFFF", border: "#E8E0D4", fg: "#1A1612", muted: "#6F675F",
  accent: "#F97316", err: "#DC2626", errBg: "#FEF2F2", warn: "#92400E", warnBg: "#FFFBEB",
  ok: "#065F46", okBg: "#ECFDF5", info: "#0369A1", infoBg: "#F0F9FF",
};
const btn = (kind: "primary" | "ghost" | "danger" = "ghost", disabled = false): React.CSSProperties => ({
  padding: "9px 14px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
  border: kind === "ghost" ? `1.5px solid ${C.border}` : "none",
  background: disabled ? "#E8E0D4" : kind === "primary" ? C.accent : kind === "danger" ? C.err : C.card,
  color: disabled ? "#8C837A" : kind === "ghost" ? C.fg : "#fff", whiteSpace: "nowrap",
});
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 };
const h2: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.muted, margin: "0 0 10px" };
const cell: React.CSSProperties = { padding: "4px 4px", borderBottom: `1px solid ${C.border}`, fontSize: 12, verticalAlign: "middle" };
const th: React.CSSProperties = { ...cell, fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "left", textTransform: "uppercase" };
const inp = (w: number | string = 44): React.CSSProperties => ({
  width: w, padding: "4px 5px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 6,
  background: "#FBF8F4", fontVariantNumeric: "tabular-nums", boxSizing: "border-box",
});

const STATUS_LABEL: Record<ImportStatus, { label: string; color: string; bg: string }> = {
  processing: { label: "A processar", color: C.info, bg: C.infoBg },
  needs_review: { label: "Precisa de revisão", color: C.warn, bg: C.warnBg },
  ready_to_confirm: { label: "Pronto a confirmar", color: C.ok, bg: C.okBg },
  confirmed: { label: "Confirmado · aguarda aprovação", color: C.info, bg: C.infoBg },
  published: { label: "Publicado", color: C.ok, bg: C.okBg },
  failed: { label: "Leitura falhou", color: C.err, bg: C.errBg },
};

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};
const pct = (c: number | null) => (c === null ? "—" : `${Math.round(c * 100)}%`);
const other = (s: Side): Side => (s === "home" ? "away" : "home");

// ── Componente ────────────────────────────────────────────────────────────────

export function GameSheetReview({ importId, backHref }: { importId: string; backHref: string }) {
  const [view, setView] = useState<ImportView | null>(null);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "load" | "save" | "reanalyze" | "confirm" | "apply">("load");
  // Admin da liga: aplicar o boletim diretamente ao jogo
  const [motivo, setMotivo] = useState("");
  const [regenNews, setRegenNews] = useState(false);
  // Admin da liga: instruções livres para a IA ao reanalisar a imagem
  const [aiInstructions, setAiInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"dados" | "imagem">("dados");
  const [sideTab, setSideTab] = useState<Side>("home");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 960px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const apply = useCallback((v: ImportView) => {
    setView(v);
    setSheet(v.sheet);
    setDirty(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/liga/equipa/game-sheet/imports/${importId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
        apply(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    })();
  }, [importId, apply]);

  // Avisa antes de sair com alterações por guardar
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const analysis: Analysis | null = useMemo(() => (sheet ? analyzeSheet(sheet) : null), [sheet]);
  const editable = Boolean(view?.can_edit) && busy === null;

  function edit(fn: (s: SheetData) => SheetData) {
    if (!sheet || !editable) return;
    setSheet(fn(structuredClone(sheet)));
    setDirty(true);
    setNotice(null);
    setAck(false);
  }

  const updateEvent = (id: string, patch: Partial<SheetEvent>, verify = true) =>
    edit((s) => ({ ...s, events: s.events.map((e) => (e.id === id ? { ...e, ...patch, ...(verify ? { userVerified: true } : {}) } : e)) }));
  const updatePlayer = (id: string, patch: Partial<SheetPlayer>) =>
    edit((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  function addEvent(side: Side) {
    edit((s) => {
      const evs = s.events.filter((e) => e.side === side);
      const last = evs.sort((a, b) => b.seq - a.seq)[0];
      return {
        ...s,
        events: [...s.events, {
          id: `u${Date.now().toString(36)}`, side, seq: (last?.seq ?? -1) + 1, period: last?.period ?? 1,
          cumulative: last?.cumulative != null ? last.cumulative + 2 : 2, points: null, shotType: null,
          playerNumber: null, confidence: null, note: "Adicionado na revisão", region: null, userVerified: true, voided: false,
        }],
      };
    });
  }
  function addPlayer(side: Side) {
    edit((s) => ({
      ...s,
      players: [...s.players, {
        id: `up${Date.now().toString(36)}`, side, number: null, name: "", hoophubPlayerId: null,
        fouls: null, played: true, confidence: null,
      }],
    }));
  }
  function swapTeams() {
    edit((s) => ({
      ...s,
      sheetTeamAIsHome: !s.sheetTeamAIsHome,
      teams: {
        home: { ...s.teams.home, sheetName: s.teams.away.sheetName },
        away: { ...s.teams.away, sheetName: s.teams.home.sheetName },
      },
      players: s.players.map((p) => ({ ...p, side: other(p.side), hoophubPlayerId: null })),
      events: s.events.map((e) => ({ ...e, side: other(e.side) })),
      periods: s.periods.map((p) => ({ ...p, home: p.away, away: p.home })),
      final: { home: s.final.away, away: s.final.home },
      teamFouls: s.teamFouls.map((f) => ({ ...f, side: other(f.side) })),
      timeouts: s.timeouts.map((t) => ({ ...t, side: other(t.side) })),
    }));
  }

  async function call(kind: "save" | "reanalyze" | "confirm" | "apply"): Promise<ImportView | null> {
    if (!view || !sheet) return null;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      let current = view;
      if (kind === "save" || ((kind === "confirm" || kind === "apply") && dirty)) {
        const res = await fetch(`/api/liga/equipa/game-sheet/imports/${view.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheet, version: view.updated_at }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao guardar");
        apply(json);
        current = json;
        if (kind === "save") {
          setNotice(json.needs_reconfirmation ? "Rascunho guardado. O boletim tem de ser confirmado novamente." : "Rascunho guardado.");
          return json;
        }
      }
      if (kind === "apply") {
        const res = await fetch(`/api/liga/admin/game-sheets/${view.id}/apply`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo, acknowledge_warnings: ack, regenerate_news: regenNews, version: current.updated_at }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao aplicar");
        const fresh = await fetch(`/api/liga/equipa/game-sheet/imports/${view.id}`);
        if (fresh.ok) apply(await fresh.json());
        setNotice(json.news_regenerating
          ? "Boletim aplicado ao jogo: resultado e estatísticas atualizados. A notícia está a ser regenerada."
          : "Boletim aplicado ao jogo: resultado e estatísticas atualizados.");
        return null;
      }
      const res = await fetch(`/api/liga/equipa/game-sheet/imports/${view.id}/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "confirm" ? { acknowledge_warnings: ack, notes, version: current.updated_at }
            : kind === "reanalyze" && view.is_liga_admin && aiInstructions.trim() ? { instructions: aiInstructions.trim() }
            : {},
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro");
      apply(json);
      if (kind === "confirm") setNotice("Resultado submetido. Fica pendente até ser aprovado pelo admin da liga.");
      if (kind === "reanalyze") setNotice(json.analysis_error ? `Nova leitura falhou: ${json.analysis_error}` : "Imagem reanalisada.");
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  // ── Render ──
  if (busy === "load") return <p style={{ padding: 24, color: C.muted }}>A carregar boletim…</p>;
  if (!view || !sheet || !analysis) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: C.err }}>{error ?? "Boletim não encontrado."}</p>
        <Link href={backHref} style={{ color: C.accent }}>← Voltar</Link>
      </div>
    );
  }

  const st = STATUS_LABEL[view.status];
  const errors = analysis.issues.filter((i) => i.severity === "error");
  const warnings = analysis.issues.filter((i) => i.severity === "warning");
  const infos = analysis.issues.filter((i) => i.severity === "info");
  const selectedEvent = sheet.events.find((e) => e.id === selected) ?? null;

  const imagePanel = (
    <div style={{ ...card, padding: 8, position: wide ? "sticky" : "static", top: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "2px 4px 8px" }}>
        <span style={h2}>Boletim original</span>
        {view.image_url && (
          <button style={{ ...btn(), padding: "4px 10px", fontSize: 11 }} onClick={() => setZoom((z) => !z)}>
            {zoom ? "Ajustar" : "Ampliar"}
          </button>
        )}
      </div>
      {view.image_url ? (
        <div style={{ overflow: "auto", maxHeight: wide ? "80vh" : "70vh", borderRadius: 8, background: "#EEE" }}>
          <div style={{ position: "relative", width: zoom ? "220%" : "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.image_url} alt="Fotografia do boletim de jogo" style={{ width: "100%", display: "block" }} />
            {selectedEvent?.region && (
              <div
                aria-label="Região da marcação selecionada"
                style={{
                  position: "absolute", border: `3px solid ${C.accent}`, borderRadius: 4, boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)",
                  left: `${selectedEvent.region.x * 100}%`, top: `${selectedEvent.region.y * 100}%`,
                  width: `${Math.max(selectedEvent.region.w * 100, 1.5)}%`, height: `${Math.max(selectedEvent.region.h * 100, 1)}%`,
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: C.muted, padding: 8 }}>Imagem indisponível.</p>
      )}
      {selectedEvent && (
        <p style={{ fontSize: 11, color: C.muted, margin: "6px 4px 0" }}>
          {selectedEvent.region ? "Marcação destacada na imagem" : "Esta marcação não tem região identificada."}
          {" · "}acumulado {selectedEvent.cumulative ?? "?"}
        </p>
      )}
    </div>
  );

  const IssueRow = ({ i }: { i: Issue }) => {
    const color = i.severity === "error" ? C.err : i.severity === "warning" ? C.warn : C.info;
    return (
      <li
        onClick={() => {
          if (!i.eventId) return;
          const ev = sheet.events.find((e) => e.id === i.eventId);
          if (ev) setSideTab(ev.side);
          setSelected(i.eventId);
          if (!wide && ev?.region) setTab("imagem");
        }}
        style={{ fontSize: 12, color, margin: "0 0 4px", cursor: i.eventId ? "pointer" : "default", listStyle: "none" }}
      >
        {i.severity === "error" ? "✖" : i.severity === "warning" ? "⚠" : "ℹ"} {i.message}
        {i.eventId && <span style={{ textDecoration: "underline", marginLeft: 4 }}>ver</span>}
      </li>
    );
  };

  const teamName = (s: Side) => (s === "home" ? sheet.teams.home.name : sheet.teams.away.name);

  const dataPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      {/* Validação */}
      <section style={card}>
        <h3 style={h2}>Validação</h3>
        {errors.length === 0 && warnings.length === 0 ? (
          <p style={{ fontSize: 13, color: C.ok, margin: 0, fontWeight: 600 }}>✓ Os dados são matematicamente consistentes.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0 }}>
            {errors.map((i, k) => <IssueRow key={`e${k}`} i={i} />)}
            {warnings.map((i, k) => <IssueRow key={`w${k}`} i={i} />)}
          </ul>
        )}
        {infos.length > 0 && <ul style={{ margin: "6px 0 0", padding: 0 }}>{infos.map((i, k) => <IssueRow key={`i${k}`} i={i} />)}</ul>}
        {sheet.aiWarnings.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 11, color: C.muted, cursor: "pointer" }}>Notas da leitura automática ({sheet.aiWarnings.length})</summary>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {sheet.aiWarnings.map((w, k) => <li key={k} style={{ fontSize: 11, color: C.muted }}>{w}</li>)}
            </ul>
          </details>
        )}
      </section>

      {/* Resultado e parciais */}
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ ...h2, margin: 0 }}>Resultado e parciais</h3>
          {editable && (
            <button style={{ ...btn(), padding: "4px 10px", fontSize: 11 }} onClick={swapTeams} title="Usar se a Equipa A da folha for a visitante">
              ⇄ Trocar equipas da folha
            </button>
          )}
        </div>
        {(sheet.teams.home.sheetName || sheet.teams.away.sheetName) && (
          <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>
            Lido na folha: {sheet.teams.home.sheetName ?? "?"} (casa) · {sheet.teams.away.sheetName ?? "?"} (fora)
          </p>
        )}
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Equipa</th>
                {sheet.periods.map((p) => <th key={p.period} style={{ ...th, textAlign: "center" }}>{p.period <= 4 ? `P${p.period}` : `OT${p.period - 4}`}</th>)}
                <th style={{ ...th, textAlign: "center" }}>Soma</th>
                <th style={{ ...th, textAlign: "center" }}>Final</th>
              </tr>
            </thead>
            <tbody>
              {(["home", "away"] as const).map((side) => {
                const t = analysis.teams[side];
                const bad = t.periodsSum !== null && t.final !== null && t.periodsSum !== t.final;
                return (
                  <tr key={side}>
                    <td style={{ ...cell, fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{teamName(side)}</td>
                    {sheet.periods.map((p, idx) => (
                      <td key={p.period} style={{ ...cell, textAlign: "center" }}>
                        <input
                          aria-label={`${teamName(side)} ${periodLabel(p.period)}`} inputMode="numeric" disabled={!editable}
                          value={p[side] ?? ""} style={inp(42)}
                          onChange={(e) => edit((s) => ({ ...s, periods: s.periods.map((x, j) => (j === idx ? { ...x, [side]: num(e.target.value) } : x)) }))}
                        />
                      </td>
                    ))}
                    <td style={{ ...cell, textAlign: "center", fontWeight: 700, color: bad ? C.err : C.fg }}>{t.periodsSum ?? "—"}</td>
                    <td style={{ ...cell, textAlign: "center" }}>
                      <input
                        aria-label={`Resultado final ${teamName(side)}`} inputMode="numeric" disabled={!editable}
                        value={sheet.final[side] ?? ""} style={{ ...inp(52), fontWeight: 800, fontSize: 15 }}
                        onChange={(e) => edit((s) => ({ ...s, final: { ...s.final, [side]: num(e.target.value) } }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button style={{ ...btn(), padding: "4px 10px", fontSize: 11 }}
              onClick={() => edit((s) => ({ ...s, periods: [...s.periods, { period: (s.periods.at(-1)?.period ?? 0) + 1, home: null, away: null }] }))}>
              + Prolongamento
            </button>
            {sheet.periods.length > 4 && (
              <button style={{ ...btn(), padding: "4px 10px", fontSize: 11 }} onClick={() => edit((s) => ({ ...s, periods: s.periods.slice(0, -1) }))}>
                − Remover último período
              </button>
            )}
          </div>
        )}
      </section>

      {/* Resumo por equipa */}
      <section style={card}>
        <h3 style={h2}>Estatísticas de equipa</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {(["home", "away"] as const).map((side) => {
            const t = analysis.teams[side];
            const rows: [string, string | number][] = [
              ["Resultado final", t.final ?? "—"],
              ["Marcha lida até", t.runningLast ?? "—"],
              ["Pontos atribuídos", t.attributed],
              ["Pontos por atribuir", t.unattributed ?? "—"],
              ["Estatísticas individuais", t.completeness === "complete" ? "completas" : t.completeness === "partial" ? "parciais" : "sem dados"],
              ["Faltas pessoais (total)", t.fouls ?? "—"],
              ["Jogadores utilizados", t.playersUsed ?? "—"],
              ["Descontos de tempo", t.timeouts ?? "—"],
            ];
            return (
              <div key={side} style={{ background: "#FBF8F4", borderRadius: 8, padding: 10 }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>{t.name}</p>
                {rows.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                    <span style={{ color: C.muted }}>{k}</span>
                    <strong style={{ color: k === "Pontos por atribuir" && Number(v) > 0 ? C.warn : C.fg }}>{v}</strong>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {analysis.summary.biggestPeriod && (
          <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0" }}>
            Maior parcial: {teamName(analysis.summary.biggestPeriod.side)} +{analysis.summary.biggestPeriod.margin} no {periodLabel(analysis.summary.biggestPeriod.period)}.
            {analysis.summary.comeback && ` Recuperação de ${analysis.summary.comeback.deficit} pontos de desvantagem no ${periodLabel(analysis.summary.comeback.beforePeriod)}.`}
          </p>
        )}
      </section>

      {/* Seletor de equipa para marcha e jogadores */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["home", "away"] as const).map((s) => (
          <button key={s} onClick={() => setSideTab(s)} style={{ ...btn(sideTab === s ? "primary" : "ghost"), flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
            {teamName(s)}
          </button>
        ))}
      </div>

      {/* Marcha do resultado */}
      <section style={card}>
        <h3 style={h2}>Marcha do resultado — {teamName(sideTab)}</h3>
        <p style={{ fontSize: 11, color: C.muted, margin: "-4px 0 8px" }}>
          O valor de cada lançamento é a diferença entre acumulados. Corrigir uma linha marca-a como revista (✓).
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Per.</th><th style={th}>Acum.</th><th style={th}>+Pts</th><th style={th}>N.º</th>
                <th style={th}>Jogador</th><th style={th}>Tipo</th><th style={th}>Conf.</th><th style={th}>Estado</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {sheet.events.filter((e) => e.side === sideTab).sort((a, b) => a.seq - b.seq).map((e) => {
                const a = analysis.events.find((x) => x.id === e.id);
                const player = a?.playerId ? sheet.players.find((p) => p.id === a.playerId) : null;
                const issue = analysis.issues.some((i) => i.eventId === e.id);
                const bg = e.id === selected ? "#FFF1E6" : e.voided ? "#F5F5F5" : issue ? C.warnBg : undefined;
                return (
                  <tr key={e.id} style={{ background: bg, opacity: e.voided ? 0.55 : 1 }} onClick={() => setSelected(e.id)}>
                    <td style={cell}>
                      <input aria-label="Período" inputMode="numeric" disabled={!editable} value={e.period ?? ""} style={inp(34)}
                        onChange={(ev) => { const v = num(ev.target.value); updateEvent(e.id, { period: v && v <= 10 ? v : null }); }} />
                    </td>
                    <td style={cell}>
                      <input aria-label="Pontuação acumulada" inputMode="numeric" disabled={!editable} value={e.cumulative ?? ""} style={{ ...inp(48), fontWeight: 700 }}
                        onChange={(ev) => updateEvent(e.id, { cumulative: num(ev.target.value) })} />
                    </td>
                    <td style={{ ...cell, fontWeight: 700, textAlign: "center" }}>{a?.delta != null && !a.excluded ? `+${a.delta}` : "—"}</td>
                    <td style={cell}>
                      <input aria-label="Número do jogador" inputMode="numeric" disabled={!editable} value={e.playerNumber ?? ""} style={inp(40)}
                        onChange={(ev) => { const v = num(ev.target.value); updateEvent(e.id, { playerNumber: v !== null && v <= 99 ? v : null }); }} />
                    </td>
                    <td style={{ ...cell, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player?.name || "—"}</td>
                    <td style={cell}>
                      <select aria-label="Tipo de lançamento" disabled={!editable} value={e.shotType ?? ""} style={inp(62)}
                        onChange={(ev) => updateEvent(e.id, { shotType: (ev.target.value || null) as ShotType | null, points: null })}>
                        <option value="">—</option><option value="FT">LL</option><option value="2PT">2P</option><option value="3PT">3P</option>
                      </select>
                    </td>
                    <td style={{ ...cell, color: e.confidence !== null && e.confidence < 0.6 ? C.warn : C.muted }}>{e.userVerified ? "✓" : pct(e.confidence)}</td>
                    <td style={{ ...cell, fontSize: 11, maxWidth: 180 }}>
                      {e.voided ? "Anulado" : a?.attributed ? <span style={{ color: C.ok }}>Atribuído</span> : <span style={{ color: C.warn }}>{a?.reason ?? "Por atribuir"}</span>}
                      {e.note && <div style={{ color: C.muted }}>{e.note}</div>}
                    </td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      {editable && (
                        <>
                          {!e.userVerified && !e.voided && (
                            <button title="Confirmar leitura" style={{ ...btn(), padding: "2px 7px", fontSize: 11 }} onClick={(ev) => { ev.stopPropagation(); updateEvent(e.id, {}); }}>✓</button>
                          )}
                          <button title={e.voided ? "Repor" : "Anular marcação"} style={{ ...btn(), padding: "2px 7px", fontSize: 11, marginLeft: 4 }}
                            onClick={(ev) => { ev.stopPropagation(); updateEvent(e.id, { voided: !e.voided }); }}>{e.voided ? "↺" : "⊘"}</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sheet.events.filter((e) => e.side === sideTab).length === 0 && (
          <p style={{ fontSize: 12, color: C.muted }}>Sem marcações lidas. Os pontos ficam por atribuir — o resultado e os parciais continuam válidos.</p>
        )}
        {editable && <button style={{ ...btn(), marginTop: 8, padding: "5px 10px", fontSize: 12 }} onClick={() => addEvent(sideTab)}>+ Marcação</button>}
      </section>

      {/* Jogadores */}
      <section style={card}>
        <h3 style={h2}>Jogadores — {teamName(sideTab)}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>N.º</th><th style={th}>Nome</th><th style={th}>Pts</th><th style={th}>LL</th><th style={th}>2P</th>
                <th style={th}>3P</th><th style={th}>Por período</th><th style={th}>% eq.</th><th style={th}>Faltas</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {sheet.players.filter((p) => p.side === sideTab).map((p) => {
                const ps = analysis.players.find((x) => x.playerId === p.id);
                return (
                  <tr key={p.id}>
                    <td style={cell}>
                      <input aria-label="Número" inputMode="numeric" disabled={!editable} value={p.number ?? ""} style={inp(40)}
                        onChange={(e) => { const v = num(e.target.value); updatePlayer(p.id, { number: v !== null && v <= 99 ? v : null, hoophubPlayerId: null }); }} />
                    </td>
                    <td style={cell}>
                      <input aria-label="Nome" disabled={!editable} value={p.name} style={inp("100%")} maxLength={200}
                        onChange={(e) => updatePlayer(p.id, { name: e.target.value, hoophubPlayerId: null })} />
                      {p.hoophubPlayerId && <div style={{ fontSize: 10, color: C.ok }}>✓ associado ao plantel HoopHub</div>}
                    </td>
                    <td style={{ ...cell, fontWeight: 800 }}>{ps?.points ?? 0}</td>
                    <td style={cell}>{ps?.ftMade ?? 0}</td>
                    <td style={cell}>{ps?.fg2Made ?? 0}</td>
                    <td style={cell}>{ps?.fg3Made ?? 0}</td>
                    <td style={{ ...cell, fontSize: 11, color: C.muted }}>
                      {ps && Object.keys(ps.byPeriod).length ? Object.entries(ps.byPeriod).map(([k, v]) => `P${k}:${v}`).join(" ") : "—"}
                    </td>
                    <td style={cell}>{ps?.pctOfTeam != null ? `${ps.pctOfTeam}%` : "—"}</td>
                    <td style={cell}>
                      <input aria-label="Faltas" inputMode="numeric" disabled={!editable} value={p.fouls ?? ""} style={inp(36)}
                        onChange={(e) => { const v = num(e.target.value); updatePlayer(p.id, { fouls: v !== null && v <= 10 ? v : null }); }} />
                    </td>
                    <td style={cell}>
                      {editable && (
                        <button title="Remover jogador" style={{ ...btn(), padding: "2px 7px", fontSize: 11 }}
                          onClick={() => edit((s) => ({ ...s, players: s.players.filter((x) => x.id !== p.id) }))}>✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: C.muted, margin: "6px 0 0" }}>
          Pontos só contam quando a marcação está atribuída. Não são calculadas tentativas falhadas, ressaltos, assistências ou minutos — o boletim não os regista.
        </p>
        {editable && <button style={{ ...btn(), marginTop: 8, padding: "5px 10px", fontSize: 12 }} onClick={() => addPlayer(sideTab)}>+ Jogador</button>}
      </section>

      {/* Oficiais */}
      <section style={card}>
        <h3 style={h2}>Oficiais de jogo</h3>
        <label style={{ fontSize: 12, color: C.muted }}>Árbitros (separados por vírgula)
          <input disabled={!editable} value={sheet.officials.referees.join(", ")} style={{ ...inp("100%"), marginTop: 4 }}
            onChange={(e) => edit((s) => ({ ...s, officials: { ...s.officials, referees: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5) } }))} />
        </label>
        <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>
          Marcador: {sheet.officials.scorer ?? "—"} · Cronometrista: {sheet.officials.timekeeper ?? "—"}
        </p>
      </section>

      {view.corrections.length > 0 && (
        <details style={card}>
          <summary style={{ ...h2, margin: 0, cursor: "pointer" }}>Histórico de correções ({view.corrections.length})</summary>
          <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
            {view.corrections.slice().reverse().map((c, k) => (
              <li key={k} style={{ fontSize: 12, color: C.muted }}>{new Date(c.at).toLocaleString("pt-PT")} — {c.changes.join(", ")}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );

  const canConfirm = analysis.canConfirm && (!analysis.requiresAcknowledgement || ack);
  const showActions = view.can_edit && !view.is_liga_admin;
  const showAdminActions = view.is_liga_admin && ["needs_review", "ready_to_confirm", "confirmed", "failed"].includes(view.status);

  return (
    <div style={{ background: C.bg, minHeight: "100dvh", paddingBottom: showActions || showAdminActions ? 170 : 40, color: C.fg }}>
      {/* A. Cabeçalho */}
      <div style={{ background: "#0A1220", color: "#F6F2EC", padding: "18px 16px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <Link href={backHref} style={{ color: "#F97316", fontSize: 12, textDecoration: "none" }}>← Voltar</Link>
          <p style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: 10, letterSpacing: "0.14em", color: "#F97316", margin: "8px 0 4px", textTransform: "uppercase" }}>
            Importação de boletim com IA {view.game?.isTest ? "· jogo de teste" : ""}
          </p>
          <h1 style={{ fontFamily: "var(--font-bc-heavy, sans-serif)", fontSize: 22, margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {sheet.teams.home.name} <span style={{ color: "#F97316" }}>{sheet.final.home ?? "–"} : {sheet.final.away ?? "–"}</span> {sheet.teams.away.name}
          </h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 12, color: "#B8AEA3" }}>
            <span style={{ background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>{st.label}</span>
            {view.game?.date && <span>{new Date(view.game.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}</span>}
            {sheet.game.competition && <span>· {sheet.game.competition}</span>}
            {sheet.game.venue && <span>· {sheet.game.venue}</span>}
            {sheet.aiConfidence !== null && <span>· confiança da leitura {pct(sheet.aiConfidence)}</span>}
            {view.usage && <span>· {view.usage.model} · {view.usage.calls} chamada(s){view.usage.durationMs ? ` · ${(view.usage.durationMs / 1000).toFixed(1)} s` : ""}</span>}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "14px 16px" }}>
        {view.status === "failed" && (
          <div style={{ ...card, background: C.errBg, borderColor: "#FECACA", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.err, fontWeight: 600 }}>A leitura automática falhou{view.error ? `: ${view.error}` : ""}.</p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: C.fg }}>Pode reanalisar ou preencher o resultado e os parciais manualmente abaixo.</p>
          </div>
        )}
        {view.status === "confirmed" && (
          <div style={{ ...card, background: C.infoBg, borderColor: "#BAE6FD", marginBottom: 12, fontSize: 13 }}>
            Submetido para aprovação{view.confirmed_at ? ` em ${new Date(view.confirmed_at).toLocaleString("pt-PT")}` : ""}. Pode ainda corrigir — terá de confirmar de novo.
          </div>
        )}
        {view.status === "published" && (
          <div style={{ ...card, background: C.okBg, borderColor: "#A7F3D0", marginBottom: 12, fontSize: 13 }}>
            Aprovado e publicado. Para corrigir um resultado já publicado, importe novamente o boletim — a nova versão substitui a anterior após aprovação.
          </div>
        )}
        {view.is_liga_admin && view.status === "confirmed" && (
          <div style={{ ...card, marginBottom: 12, fontSize: 13 }}>
            Vista do admin: pode aprovar ou rejeitar a submissão do delegado em <Link href="/liga-inatel/admin" style={{ color: C.accent }}>Administração da liga</Link>,
            ou corrigir aqui e aplicar o boletim diretamente ao jogo.
          </div>
        )}
        {error && <div role="alert" style={{ ...card, background: C.errBg, borderColor: "#FECACA", color: C.err, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {notice && <div role="status" style={{ ...card, background: C.okBg, borderColor: "#A7F3D0", color: C.ok, fontSize: 13, marginBottom: 12 }}>{notice}</div>}

        {showAdminActions && view.status !== "confirmed" && (
          <details style={{ ...card, marginBottom: 12 }} open={aiInstructions.trim().length > 0}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              Não está contente com a leitura da IA? Dê-lhe instruções
            </summary>
            <p style={{ fontSize: 12, color: C.muted, margin: "8px 0" }}>
              Escreva o que a IA deve ter em conta ao reler a folha (ex.: &quot;a equipa A é a visitante&quot;, &quot;o jogador n.º 7 é o Rui Costa&quot;,
              &quot;o 3.º período termina em 41-38&quot;, &quot;os acumulados a azul são do 2.º período&quot;). As instruções têm prioridade sobre as
              convenções por defeito; a IA continua a não poder inventar o que não está na folha. Use depois &quot;Reanalisar imagem&quot;
              (com instruções não há limite de análises).
            </p>
            <textarea
              value={aiInstructions}
              maxLength={4000}
              rows={6}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="Instruções para a IA…"
              style={{ ...inp("100%"), fontSize: 12, padding: "8px", lineHeight: 1.45, resize: "vertical", boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 11, color: C.muted, margin: "4px 0 0" }}>{aiInstructions.length}/4000</p>
          </details>
        )}

        {wide ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)", gap: 14, alignItems: "start" }}>
            {imagePanel}
            {dataPanel}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button style={{ ...btn(tab === "dados" ? "primary" : "ghost"), flex: 1 }} onClick={() => setTab("dados")}>Dados</button>
              <button style={{ ...btn(tab === "imagem" ? "primary" : "ghost"), flex: 1 }} onClick={() => setTab("imagem")}>Imagem</button>
            </div>
            {tab === "dados" ? dataPanel : imagePanel}
          </>
        )}
      </div>

      {/* Ações */}
      {showActions && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: `1px solid ${C.border}`, padding: "10px 16px", boxShadow: "0 -6px 20px rgba(0,0,0,0.08)", zIndex: 20 }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {analysis.requiresAcknowledgement && (
              <label style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "flex-start" }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                Revi os {warnings.length} aviso(s). Os pontos não confirmados ficam &quot;por atribuir&quot; e não serão publicados como estatística individual.
              </label>
            )}
            {!analysis.canConfirm && (
              <p style={{ fontSize: 12, color: C.err, margin: 0 }}>Corrija os {errors.length} erro(s) assinalados antes de confirmar.</p>
            )}
            <input placeholder="Notas para o admin (opcional: W/O, adiado, …)" value={notes} maxLength={1000}
              onChange={(e) => setNotes(e.target.value)} style={{ ...inp("100%"), fontSize: 12, padding: "6px 8px" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn("ghost", busy !== null || !dirty)} disabled={busy !== null || !dirty} onClick={() => call("save")}>
                {busy === "save" ? "A guardar…" : "Guardar rascunho"}
              </button>
              <button
                style={btn("ghost", busy !== null || view.analysis_count >= view.max_analyses)}
                disabled={busy !== null || view.analysis_count >= view.max_analyses}
                onClick={() => {
                  if (dirty || view.corrections.length > 0) {
                    if (!window.confirm("Reanalisar substitui os dados atuais (incluindo correções manuais). Continuar?")) return;
                  }
                  void call("reanalyze");
                }}
              >
                {busy === "reanalyze" ? "A reanalisar… (até 1 min)" : `Reanalisar imagem (${view.analysis_count}/${view.max_analyses})`}
              </button>
              <button style={{ ...btn("primary", busy !== null || !canConfirm), flex: 1, minWidth: 180 }} disabled={busy !== null || !canConfirm} onClick={() => call("confirm")}>
                {busy === "confirm" ? "A submeter…" : view.status === "confirmed" && !dirty ? "Submeter de novo" : "Confirmar e submeter resultado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ações do admin da liga */}
      {showAdminActions && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: `1px solid ${C.border}`, padding: "10px 16px", boxShadow: "0 -6px 20px rgba(0,0,0,0.08)", zIndex: 20 }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {analysis.requiresAcknowledgement && (
              <label style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "flex-start" }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                Revi os {warnings.length} aviso(s). Os pontos não confirmados ficam &quot;por atribuir&quot;.
              </label>
            )}
            {!analysis.canConfirm && (
              <p style={{ fontSize: 12, color: C.err, margin: 0 }}>Corrija os {errors.length} erro(s) assinalados antes de aplicar.</p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input placeholder="Motivo (obrigatório) — ex.: folha melhorada, mais legível" value={motivo} maxLength={500}
                onChange={(e) => setMotivo(e.target.value)} style={{ ...inp("auto"), flex: 1, minWidth: 220, fontSize: 12, padding: "6px 8px" }} />
              <label style={{ display: "flex", gap: 6, fontSize: 12, alignItems: "center" }}>
                <input type="checkbox" checked={regenNews} onChange={(e) => setRegenNews(e.target.checked)} />
                Atualizar a notícia com as novas estatísticas
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn("ghost", busy !== null || !dirty)} disabled={busy !== null || !dirty} onClick={() => call("save")}>
                {busy === "save" ? "A guardar…" : "Guardar rascunho"}
              </button>
              <button
                style={btn("ghost", busy !== null || (view.analysis_count >= view.max_analyses && !aiInstructions.trim()) || view.status === "confirmed")}
                disabled={busy !== null || (view.analysis_count >= view.max_analyses && !aiInstructions.trim()) || view.status === "confirmed"}
                onClick={() => {
                  if (dirty || view.corrections.length > 0) {
                    if (!window.confirm("Reanalisar substitui os dados atuais (incluindo correções manuais). Continuar?")) return;
                  }
                  void call("reanalyze");
                }}
              >
                {busy === "reanalyze" ? "A reanalisar… (até 1 min)" : aiInstructions.trim() ? `Reanalisar com as minhas instruções (${view.analysis_count})` : `Reanalisar imagem (${view.analysis_count}/${view.max_analyses})`}
              </button>
              <button
                style={{ ...btn("primary", busy !== null || !canConfirm || !motivo.trim()), flex: 1, minWidth: 200 }}
                disabled={busy !== null || !canConfirm || !motivo.trim()}
                onClick={() => {
                  if (!window.confirm("Aplicar este boletim ao jogo? O resultado, os parciais e as estatísticas atuais serão substituídos (fica registado na auditoria).")) return;
                  void call("apply");
                }}
              >
                {busy === "apply" ? "A aplicar…" : "Aplicar ao jogo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
