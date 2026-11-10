"use client";

/**
 * Painel de validação cruzada (admin da liga): documentos das duas equipas, dados extraídos,
 * comparação, resultado e parciais consolidados, estatísticas individuais com a fonte de cada
 * valor, divergências, erros matemáticos, confiança, estado, correções manuais (auditadas),
 * reanálise DeepSeek e aprovação.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReconciliationResult, Discrepancy, ConsolidatedPlayer } from "@/lib/match-docs/reconcile";
import type { MathIssue } from "@/lib/match-docs/validate";
import type { StatKey } from "@/lib/match-docs/pro-stats-schema";

type Doc = {
  id: string; doc_type: "official_sheet" | "pro_stats"; status: string; team_side: "home" | "away" | null; team_name: string;
  image_url: string | null; image_mime: string | null; page_count: number | null; error: string | null; analysis_count: number;
  created_at: string; confirmed_at: string | null; counted: boolean;
  stats: { app?: string | null; final?: { home: number | null; away: number | null }; periods?: { period: number; home: number | null; away: number | null }[] } | null;
  sheet: { final?: { home: number | null; away: number | null }; periods?: { period: number; home: number | null; away: number | null }[] } | null;
};
type Panel = {
  game: { id: string; home: string; away: string; date: string | null; is_test: boolean };
  reconciliation: null | {
    status: string; consolidated: ReconciliationResult | null; confidence: number | null;
    ai_review: { assessment?: string | null; confidence?: number | null } | null; ai_usage: { ranAt?: string; error?: string } | null;
    overrides: Record<string, unknown>; run_count: number; error: string | null; analyzed_at: string | null; approved_at: string | null;
  };
  documents: Doc[];
  corrections: { id: string; field_path: string; label: string; old_value: unknown; new_value: unknown; reason: string | null; corrected_at: string }[];
  pending_submission: { id: string } | null;
  approved_result: { home_score: number; away_score: number; approved_at: string } | null;
};

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending_submission: { label: "Pendente de submissão", color: "#A16207", bg: "#FEFCE8" },
  analyzing: { label: "Em análise", color: "#1D4ED8", bg: "#EFF6FF" },
  validated: { label: "Validado", color: "#15803D", bg: "#F0FDF4" },
  discrepancies: { label: "Divergências detetadas", color: "#B91C1C", bg: "#FEF2F2" },
  manual_review: { label: "Revisão manual necessária", color: "#C2410C", bg: "#FFF7ED" },
};
const SEV: Record<string, { label: string; color: string }> = {
  high: { label: "Relevante", color: "#B91C1C" }, medium: { label: "Média", color: "#C2410C" }, low: { label: "Baixa", color: "#6B7280" },
};
const DOC_STATUS: Record<string, string> = {
  processing: "a analisar", needs_review: "por rever", ready_to_confirm: "por confirmar", confirmed: "confirmado pela equipa", published: "publicado", failed: "falhou",
};
const PCOLS: [StatKey, string][] = [["secs", "Min"], ["pts", "Pts"], ["fg2m", "2PC"], ["fg2a", "2PT"], ["fg3m", "3PC"], ["fg3a", "3PT"], ["ftm", "LLC"], ["fta", "LLT"], ["oreb", "RO"], ["dreb", "RD"], ["reb", "Res"], ["ast", "Ass"], ["stl", "Rou"], ["tov", "TO"], ["blk", "DL"], ["pf", "F"], ["fd", "FS"], ["eff", "Ef"]];

const card: React.CSSProperties = { border: "1px solid #E8E0D6", borderRadius: "8px", padding: "10px 12px", background: "#FFFDFA", marginBottom: "10px" };
const h4: React.CSSProperties = { fontSize: "12px", fontWeight: 800, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#5C534A" };
const small = (primary = false, color = "#F97316"): React.CSSProperties => ({
  fontSize: "11px", padding: "4px 9px", borderRadius: "5px", cursor: "pointer", fontWeight: 700,
  border: primary ? "none" : `1px solid ${color}`, background: primary ? color : "#fff", color: primary ? "#fff" : color,
});
const val = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const mmss = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const srcTag = (s?: string) => (!s ? "" : s === "admin" ? "A" : s.startsWith("pro:") ? "P" : s.startsWith("official:") ? "O" : "?");

export function AdminReconciliationPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Panel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<"pro_stats" | "official_sheet">("pro_stats");

  const load = useCallback(async () => {
    const res = await fetch(`/api/liga/admin/games/${eventId}/reconciliation`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro ao carregar a validação." }); return; }
    setData(json as Panel);
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, label: string): Promise<Record<string, unknown> | null> {
    setBusy(label); setMsg(null);
    const res = await fetch(`/api/liga/admin/games/${eventId}/reconciliation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro." }); return json.code ? json : null; }
    await load();
    return json;
  }

  async function correct(path: string, current: unknown, label: string, isText = false) {
    const v = window.prompt(`${label}\nValor atual: ${val(current)}\n\nNovo valor${isText ? "" : " (número; vazio = não disponível)"}:`, current === null || current === undefined ? "" : String(current));
    if (v === null) return;
    const reason = window.prompt("Motivo da correção (fica registado):", "") ?? "";
    const value = isText ? v.trim() : v.trim() === "" ? null : Number(v.trim().replace(/^(\d+):(\d{2})$/, (_m, a, b) => String(Number(a) * 60 + Number(b))));
    if (!isText && value !== null && !Number.isFinite(value as number)) { setMsg({ ok: false, text: "Valor numérico inválido." }); return; }
    const r = await post({ action: "correct", path, value, reason }, "A guardar correção…");
    if (r) setMsg({ ok: true, text: "Correção registada." });
  }

  async function approve(ack = false) {
    if (!motivo.trim()) { setMsg({ ok: false, text: "Indique o motivo da aprovação." }); return; }
    const r = await post({ action: "approve", motivo, acknowledge: ack }, "A aprovar…");
    if (r && r.code === "needs_acknowledgement") {
      const d = r.details as { discrepancies?: string[]; math?: string[] } | undefined;
      const list = [...(d?.discrepancies ?? []), ...(d?.math ?? [])].slice(0, 8).map((x) => `• ${x}`).join("\n");
      if (window.confirm(`${r.error}\n\n${list}`)) await approve(true);
      return;
    }
    if (r?.ok) setMsg({ ok: true, text: r.publishable ? "Aprovado. A notícia vai ser gerada e publicada." : "Aprovado. A notícia ficará em RASCUNHO até validar (separador Notícias)." });
  }

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setBusy("A carregar e analisar…"); setMsg(null);
    const fd = new FormData();
    fd.append("file", f); fd.append("doc_type", uploadType);
    const res = await fetch(`/api/liga/admin/games/${eventId}/reconciliation/documents`, { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    setMsg(res.ok ? { ok: !json.analysis_error, text: json.analysis_error ?? "Documento analisado." } : { ok: false, text: json.error ?? "Erro no upload." });
    await load();
  }

  if (!data) return <p style={{ fontSize: "12px", color: "#8C837A" }}>{msg?.text ?? "A carregar validação…"}</p>;
  const rec = data.reconciliation;
  const r = rec?.consolidated ?? null;
  const st = STATUS[rec?.status ?? "pending_submission"] ?? STATUS.pending_submission;
  const discrepancies = (r?.discrepancies ?? []).slice().sort((a, b) => Number(a.resolved) - Number(b.resolved) || ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  const mathErrors = (r?.mathIssues ?? []).filter((i) => i.severity === "error");
  const mathWarn = (r?.mathIssues ?? []).filter((i) => i.severity === "warning");
  const docFinal = (d: Doc) => d.doc_type === "pro_stats" ? d.stats?.final : d.sheet?.final;
  const docPeriods = (d: Doc) => (d.doc_type === "pro_stats" ? d.stats?.periods : d.sheet?.periods) ?? [];
  const analyzed = data.documents.filter((d) => d.status !== "processing" && d.status !== "failed");

  return (
    <div style={{ fontSize: "12px", color: "#1A1612" }}>
      {/* Estado */}
      <div style={{ ...card, background: st.bg, borderColor: st.color }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <span style={{ fontWeight: 800, color: st.color, fontSize: "13px" }}>{st.label}</span>
          {r && <span>· {r.publishable ? "✓ publicável" : "✗ não publicável automaticamente"}</span>}
          {rec?.confidence != null && <span>· confiança {Math.round(rec.confidence * 100)}%</span>}
          {r && <span>· casa {r.teamsSubmitted.home ? "✓" : "✗"} · fora {r.teamsSubmitted.away ? "✓" : "✗"}</span>}
          {rec?.analyzed_at && <span style={{ color: "#6B7280" }}>· analisado {new Date(rec.analyzed_at).toLocaleString("pt-PT")}</span>}
          {data.approved_result && <span style={{ color: "#15803D", fontWeight: 700 }}>· aprovado {data.approved_result.home_score}-{data.approved_result.away_score}</span>}
        </div>
        {rec?.ai_review?.assessment && <p style={{ margin: "6px 0 0" }}><strong>Análise cruzada (DeepSeek):</strong> {rec.ai_review.assessment}</p>}
        {rec?.error && <p style={{ margin: "6px 0 0", color: "#B91C1C" }}>Análise cruzada falhou: {rec.error}</p>}
        {r?.notes?.length ? <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
          <button onClick={() => post({ action: "run", force: true }, "A reanalisar com DeepSeek…")} disabled={!!busy} style={small(true, "#6366F1")}>↻ Reanalisar (DeepSeek)</button>
          <select value={uploadType} onChange={(e) => setUploadType(e.target.value as "pro_stats" | "official_sheet")} style={{ fontSize: "11px", padding: "3px", borderRadius: "5px" }}>
            <option value="pro_stats">Estatísticas profissionais</option>
            <option value="official_sheet">Folha oficial</option>
          </select>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: "none" }} onChange={uploadDoc} />
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} style={small()}>＋ Adicionar documento</button>
          {busy && <span style={{ color: "#6366F1", fontWeight: 700 }}>{busy}</span>}
        </div>
        {msg && <p style={{ margin: "6px 0 0", color: msg.ok ? "#15803D" : "#B91C1C", fontWeight: 600 }}>{msg.text}</p>}
      </div>

      {/* Documentos */}
      <div style={card}>
        <p style={h4}>1. Documentos submetidos</p>
        {data.documents.length === 0 && <p style={{ margin: 0, color: "#8C837A" }}>Nenhuma equipa submeteu documentos.</p>}
        {(["home", "away", null] as const).map((side) => {
          const docs = data.documents.filter((d) => d.team_side === side);
          if (!docs.length) return null;
          return (
            <div key={String(side)} style={{ marginBottom: "6px" }}>
              <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{side ? `${data.game[side]} (${side === "home" ? "casa" : "fora"})` : "Admin"}</p>
              {docs.map((d) => (
                <div key={d.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", padding: "3px 0" }}>
                  <span style={{ fontWeight: 600 }}>{d.doc_type === "pro_stats" ? `📊 Estatísticas${d.stats?.app ? ` (${d.stats.app})` : ""}` : "📝 Folha oficial"}</span>
                  <span style={{ color: "#6B7280" }}>{DOC_STATUS[d.status] ?? d.status}{d.page_count && d.page_count > 1 ? ` · ${d.page_count} pág.` : ""}</span>
                  {d.counted && <span style={{ color: "#15803D", fontWeight: 700 }}>· usado</span>}
                  {docFinal(d)?.home != null && <span>· {docFinal(d)!.home}-{docFinal(d)!.away ?? "?"}</span>}
                  {d.image_url && <a href={d.image_url} target="_blank" rel="noopener noreferrer" style={{ color: "#C2530A", fontWeight: 700 }}>abrir ↗</a>}
                  {d.doc_type === "official_sheet" && <a href={`/liga-inatel/boletim/${d.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#C2530A" }}>leitura ↗</a>}
                  {d.status !== "published" && d.status !== "processing" && (
                    <button
                      disabled={!!busy}
                      onClick={() => { const ins = window.prompt("Reanalisar este documento com o DeepSeek.\nInstruções opcionais para a IA (ex.: “a coluna Pts é a 3.ª”):", ""); if (ins !== null) void post({ action: "reanalyze_doc", import_id: d.id, instructions: ins }, "A reanalisar documento…"); }}
                      style={small(false, "#6366F1")}
                    >↻</button>
                  )}
                  {d.error && <span style={{ color: "#B91C1C" }}>{d.error}</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {r && (
        <>
          {/* Resultado e parciais */}
          <div style={card}>
            <p style={h4}>2–4. Resultado e parciais — comparação</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", minWidth: "460px", width: "100%" }}>
                <thead>
                  <tr style={{ background: "#F6F2EC" }}>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Fonte</th>
                    {r.periods.map((p) => <th key={p.period} style={{ padding: "4px" }}>{p.period <= 4 ? `P${p.period}` : `Prol.${p.period - 4}`}</th>)}
                    <th style={{ padding: "4px" }}>Final</th>
                  </tr>
                </thead>
                <tbody>
                  {analyzed.map((d) => (
                    <tr key={d.id} style={{ borderTop: "1px solid #E8E0D6", opacity: d.counted || d.status === "confirmed" ? 1 : 0.55 }}>
                      <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{d.doc_type === "pro_stats" ? "📊" : "📝"} {d.team_name}</td>
                      {r.periods.map((p) => { const x = docPeriods(d).find((y) => y.period === p.period); return <td key={p.period} style={{ textAlign: "center" }}>{x ? `${val(x.home)}-${val(x.away)}` : "—"}</td>; })}
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{docFinal(d) ? `${val(docFinal(d)!.home)}-${val(docFinal(d)!.away)}` : "—"}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid #1A1612", fontWeight: 800 }}>
                    <td style={{ padding: "4px 6px" }}>Consolidado</td>
                    {r.periods.map((p) => (
                      <td key={p.period} style={{ textAlign: "center" }}>
                        <button onClick={() => correct(`periods.${p.period}.home`, p.home, `P${p.period} — ${data.game.home}`)} style={{ all: "unset", cursor: "pointer", textDecoration: "underline dotted" }}>{val(p.home)}</button>-
                        <button onClick={() => correct(`periods.${p.period}.away`, p.away, `P${p.period} — ${data.game.away}`)} style={{ all: "unset", cursor: "pointer", textDecoration: "underline dotted" }}>{val(p.away)}</button>
                        {p.source === "admin" && <sup style={{ color: "#6366F1" }}>A</sup>}
                      </td>
                    ))}
                    <td style={{ textAlign: "center", fontSize: "13px" }}>
                      <button onClick={() => correct("final.home", r.final.home, `Resultado final — ${data.game.home}`)} style={{ all: "unset", cursor: "pointer", textDecoration: "underline dotted" }}>{val(r.final.home)}</button>-
                      <button onClick={() => correct("final.away", r.final.away, `Resultado final — ${data.game.away}`)} style={{ all: "unset", cursor: "pointer", textDecoration: "underline dotted" }}>{val(r.final.away)}</button>
                      {r.final.source === "admin" && <sup style={{ color: "#6366F1" }}>A</sup>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ margin: "4px 0 0", color: "#8C837A" }}>Toque num valor consolidado para o corrigir (fica registado). 📝 folha oficial · 📊 estatística profissional.</p>
          </div>

          {/* Divergências */}
          <div style={card}>
            <p style={h4}>6. Divergências ({discrepancies.filter((d) => !d.resolved).length} por resolver)</p>
            {discrepancies.length === 0 && <p style={{ margin: 0, color: "#15803D" }}>Sem divergências entre documentos.</p>}
            {discrepancies.map((d: Discrepancy) => (
              <div key={d.id} style={{ borderLeft: `4px solid ${SEV[d.severity].color}`, padding: "6px 8px", margin: "0 0 6px", background: d.resolved ? "#F9FAFB" : "#fff", opacity: d.resolved ? 0.7 : 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                  <strong>{d.label}</strong>
                  <span style={{ color: SEV[d.severity].color, fontWeight: 700 }}>{SEV[d.severity].label}</span>
                  {d.origin === "ai" && <span style={{ color: "#6366F1" }}>· IA</span>}
                  {d.resolved && <span style={{ color: "#15803D", fontWeight: 700 }}>✓ resolvida</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "2px 10px", margin: "4px 0" }}>
                  <span>Equipa A ({data.game.home}): <b>{val(d.teamA)}</b></span>
                  <span>Equipa B ({data.game.away}): <b>{val(d.teamB)}</b></span>
                  <span>Folha oficial: <b>{val(d.official)}</b></span>
                  <span>Proposto: <b>{val(d.chosen)}</b></span>
                </div>
                <p style={{ margin: "2px 0", color: "#5C534A" }}>Fonte prioritária: {d.prioritySource}{d.confidence != null ? ` · confiança ${Math.round(d.confidence * 100)}%` : ""}</p>
                <p style={{ margin: "2px 0" }}>{d.reason}</p>
                <p style={{ margin: "2px 0", color: "#15803D" }}>Sugestão: {d.suggestion}</p>
                {!d.resolved && (
                  <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                    <button disabled={!!busy} onClick={() => { const reason = window.prompt("Aceitar o valor proposto. Motivo (fica registado):", ""); if (reason !== null) void post({ action: "resolve", discrepancy_id: d.id, reason }, "A registar…"); }} style={small(false, "#15803D")}>Aceitar proposto</button>
                    {(d.field === "final" || d.field.startsWith("periods.")) && <span style={{ color: "#8C837A" }}>Para outro valor, corrija o resultado/parcial na tabela acima.</span>}
                    {d.playerKey && /\.(pts|pf)$/.test(d.field) && (
                      <button disabled={!!busy} onClick={() => correct(d.field, d.chosen, d.label)} style={small()}>Corrigir valor…</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Matemática */}
          <div style={card}>
            <p style={h4}>7. Consistência matemática (código)</p>
            {mathErrors.length === 0 ? <p style={{ margin: 0, color: "#15803D" }}>✓ Dados consolidados coerentes (pontos = 2×2P + 3×3P + LL, convertidos ≤ tentados, RT = RO + RD, Σ parciais = final, Σ jogadores = resultado).</p> : (
              <ul style={{ margin: 0, paddingLeft: "18px", color: "#B91C1C" }}>{mathErrors.map((i: MathIssue, k) => <li key={k}>{i.message}</li>)}</ul>
            )}
            {mathWarn.length > 0 && (
              <details style={{ marginTop: "6px" }}>
                <summary style={{ cursor: "pointer", color: "#6B7280" }}>{mathWarn.length} aviso(s) nos documentos individuais</summary>
                <ul style={{ margin: "4px 0 0", paddingLeft: "18px", color: "#92400E" }}>{mathWarn.slice(0, 30).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
              </details>
            )}
          </div>

          {/* Jogadores */}
          <div style={card}>
            <p style={h4}>5. Estatísticas individuais consolidadas</p>
            {(["home", "away"] as const).map((side) => {
              const ps = r.players.filter((p) => p.side === side);
              return (
                <div key={side} style={{ marginBottom: "10px" }}>
                  <p style={{ fontWeight: 700, margin: "0 0 4px" }}>{data.game[side]} <span style={{ fontWeight: 400, color: "#6B7280" }}>— {({ full: "estatística completa", points: "só pontos", partial: "parcial", none: "sem estatística individual" } as const)[r.completeness[side]]}</span></p>
                  {ps.length > 0 && (
                    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ borderCollapse: "collapse", minWidth: "760px", width: "100%", fontSize: "11px" }}>
                        <thead><tr style={{ background: "#F6F2EC" }}>
                          <th style={{ textAlign: "left", padding: "4px 6px", position: "sticky", left: 0, background: "#F6F2EC" }}>Jogador</th>
                          {PCOLS.map(([, l]) => <th key={l} style={{ padding: "4px 2px" }}>{l}</th>)}
                          <th>Conf.</th>
                        </tr></thead>
                        <tbody>
                          {ps.map((p: ConsolidatedPlayer) => (
                            <tr key={p.key} style={{ borderTop: "1px solid #E8E0D6" }}>
                              <td style={{ padding: "3px 6px", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#FFFDFA" }}>
                                <button onClick={() => correct(`players.${p.key}.name`, p.name, "Nome do jogador", true)} style={{ all: "unset", cursor: "pointer" }}>{p.number !== null ? `#${p.number} ` : ""}{p.name}</button>
                                {p.inDatabase === false && <span title="Não consta da base de dados" style={{ color: "#B45309", marginLeft: 3 }}>•novo</span>}
                                {p.inOfficialSheet === false && <span title="Não identificado na folha oficial" style={{ color: "#6B7280", marginLeft: 3 }}>∉F</span>}
                              </td>
                              {PCOLS.map(([k]) => (
                                <td key={k} style={{ textAlign: "center", padding: "2px", background: p.illegible.includes(k) ? "#FEF3C7" : undefined }}>
                                  <button onClick={() => correct(`players.${p.key}.${k}`, k === "secs" ? mmss(p.stats.secs) : p.stats[k], `${p.name} — ${k}`)} style={{ all: "unset", cursor: "pointer" }}>
                                    {k === "secs" ? mmss(p.stats.secs) : val(p.stats[k])}
                                  </button>
                                  {p.sources[k] && <sup style={{ color: p.sources[k] === "admin" ? "#6366F1" : "#B8AFA6", fontSize: "8px" }}>{srcTag(p.sources[k])}</sup>}
                                </td>
                              ))}
                              <td style={{ textAlign: "center", color: "#6B7280" }}>{p.confidence != null ? `${Math.round(p.confidence * 100)}%` : "—"}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: "2px solid #1A1612", fontWeight: 700 }}>
                            <td style={{ padding: "3px 6px", position: "sticky", left: 0, background: "#FFFDFA" }}>Soma</td>
                            {PCOLS.map(([k]) => <td key={k} style={{ textAlign: "center" }}>{k === "secs" ? "" : val(r.totals[side][k])}</td>)}
                            <td />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            <p style={{ margin: 0, color: "#8C837A" }}>Fonte de cada valor: P = estatística profissional · O = folha oficial · A = corrigido pelo admin. “—” = não disponível (não é zero). Toque num valor para corrigir.</p>
          </div>

          {/* Correções */}
          {data.corrections.length > 0 && (
            <div style={card}>
              <p style={h4}>Registo de correções manuais</p>
              {data.corrections.map((c) => (
                <p key={c.id} style={{ margin: "0 0 3px" }}>
                  <span style={{ color: "#6B7280" }}>{new Date(c.corrected_at).toLocaleString("pt-PT")}</span> · {c.label}: {val(c.old_value)} → <b>{val(c.new_value)}</b>{c.reason ? ` — ${c.reason}` : ""}
                  {c.new_value !== null && !c.field_path.startsWith("resolve.") && (
                    <button onClick={() => post({ action: "clear_correction", path: c.field_path }, "A remover correção…")} style={{ ...small(false, "#6B7280"), marginLeft: 6, padding: "1px 6px" }}>desfazer</button>
                  )}
                </p>
              ))}
            </div>
          )}

          {/* Aprovação */}
          <div style={{ ...card, borderColor: "#16A34A" }}>
            <p style={h4}>Aprovar resultado e estatísticas</p>
            {!r.publishable && <p style={{ margin: "0 0 6px", color: "#B91C1C" }}>Há divergências relevantes, erros ou confiança insuficiente: pode aprovar, mas a notícia fica em rascunho até a validar.</p>}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo / nota da aprovação *" style={{ flex: 1, minWidth: "160px", fontSize: "12px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #E8E0D6" }} />
              <button onClick={() => approve(false)} disabled={!!busy || r.final.home === null} style={small(true, "#16A34A")}>✓ Aprovar {r.final.home ?? "?"}-{r.final.away ?? "?"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
