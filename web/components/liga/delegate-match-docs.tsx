"use client";

/**
 * Área de equipa — documentos do jogo:
 *  A. Folha de jogo oficial (estado; submissão no fluxo "Resultados")
 *  B. Estatísticas profissionais (Pocket Stat, …): vários ficheiros, imagem ou PDF,
 *     leitura por IA, revisão/correção das linhas inconsistentes e confirmação
 * Mostra também o estado da validação cruzada do jogo (sem dados da outra equipa).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicGame } from "@/types/competitions";
import { prepareSheetForUpload } from "@/lib/game-sheet/client-image";
import { STAT_KEYS, type ProStatsData, type StatKey } from "@/lib/match-docs/pro-stats-schema";
import { validateProStats } from "@/lib/match-docs/validate";

interface Props { games: PublicGame[]; teamName: string; preselectedGameId?: string | null }

type DocSummary = {
  id: string; doc_type: "official_sheet" | "pro_stats"; status: string; image_url: string | null; image_mime: string | null;
  page_count: number | null; error: string | null; analysis_count: number; created_at: string; updated_at: string;
  summary: { app?: string | null; final: { home: number | null; away: number | null } | null; players?: { home: number; away: number } };
  errors: string[];
};
type Overview = {
  game: { id: string; home: string; away: string };
  docs: DocSummary[];
  validation: { status: string; label: string; teams_submitted: { home: boolean; away: boolean } } | null;
};

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  processing: { label: "A analisar…", bg: "#EFF6FF", fg: "#1D4ED8" },
  needs_review: { label: "Rever", bg: "#FFF7ED", fg: "#C2410C" },
  ready_to_confirm: { label: "Pronto a confirmar", bg: "#ECFDF5", fg: "#047857" },
  confirmed: { label: "Submetido", bg: "#F0FDF4", fg: "#15803D" },
  published: { label: "Publicado", bg: "#F0FDF4", fg: "#166534" },
  failed: { label: "Leitura falhou", bg: "#FEF2F2", fg: "#B91C1C" },
};
const VALIDATION_COLORS: Record<string, string> = {
  validated: "#15803D", pending_submission: "#A16207", analyzing: "#1D4ED8", discrepancies: "#B91C1C", manual_review: "#C2410C",
};
/** Colunas mostradas na revisão (as restantes ficam guardadas mesmo sem aparecer). */
const COLS: [StatKey, string][] = [["pts", "Pts"], ["fg2m", "2PC"], ["fg2a", "2PT"], ["fg3m", "3PC"], ["fg3a", "3PT"], ["ftm", "LLC"], ["fta", "LLT"], ["oreb", "RO"], ["dreb", "RD"], ["reb", "Res"], ["ast", "Ass"], ["stl", "Rou"], ["tov", "TO"], ["blk", "DL"], ["pf", "F"]];

const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "9px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
  border: primary ? "none" : "1.5px solid var(--border,#E8E0D4)",
  background: primary ? (disabled ? "#FDBA74" : "#F97316") : "var(--card,#fff)",
  color: primary ? "#fff" : "var(--fg,#15110E)", cursor: disabled ? "not-allowed" : "pointer",
});

function fmt(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
}

function Chip({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, bg: "#F3F4F6", fg: "#374151" };
  return <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{s.label}</span>;
}

/** Revisão de um documento de estatísticas: tabela por equipa, células editáveis, erros por código. */
function ProStatsReview({ docId, game, onChanged }: { docId: string; game: { home: string; away: string }; onChanged: () => void }) {
  const [data, setData] = useState<ProStatsData | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/liga/equipa/game-sheet/imports/${docId}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro ao carregar." }); return; }
    setData(json.stats as ProStatsData | null);
    setVersion(json.updated_at);
    setStatus(json.status);
    setDirty(false);
  }, [docId]);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: "8px 0" }}>{msg?.text ?? "A carregar…"}</p>;
  const issues = validateProStats(data, { names: game });
  const errors = issues.filter((i) => i.severity === "error");
  const badPlayers = new Set(errors.map((i) => i.playerId).filter(Boolean));
  const editable = status !== "published" && status !== "processing";

  function setCell(side: "home" | "away", pid: string, key: StatKey, raw: string) {
    setData((d) => {
      if (!d || !d.teams[side]) return d;
      const v = raw.trim() === "" ? null : Number.isFinite(Number(raw)) ? Math.max(key === "pm" || key === "eff" ? -999 : 0, Math.round(Number(raw))) : null;
      const team = d.teams[side]!;
      return { ...d, teams: { ...d.teams, [side]: { ...team, players: team.players.map((p) => (p.id === pid ? { ...p, stats: { ...p.stats, [key]: v }, illegible: p.illegible.filter((k) => k !== key) } : p)) } } };
    });
    setDirty(true);
  }

  async function save() {
    setBusy("A guardar…"); setMsg(null);
    const res = await fetch(`/api/liga/equipa/game-sheet/imports/${docId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stats: data, version }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro ao guardar." }); return; }
    setMsg({ ok: true, text: json.needs_reconfirmation ? "Guardado — volte a confirmar." : "Guardado." });
    await load(); onChanged();
  }

  async function confirmDoc(ack = false) {
    if (dirty) { await save(); }
    setBusy("A confirmar…"); setMsg(null);
    const res = await fetch(`/api/liga/equipa/game-sheet/imports/${docId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledge_warnings: ack }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.status === 422 && json.code === "needs_acknowledgement") {
      if (confirm(`${json.error}\n\n${(json.issues ?? []).slice(0, 6).map((i: { message: string }) => `• ${i.message}`).join("\n")}\n\nSubmeter mesmo assim? O admin da liga verá estas inconsistências.`)) await confirmDoc(true);
      return;
    }
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro ao confirmar." }); return; }
    setMsg({ ok: true, text: "Estatísticas submetidas. Entram na validação cruzada do jogo." });
    await load(); onChanged();
  }

  async function reanalyze() {
    setBusy("A reanalisar…"); setMsg(null);
    const res = await fetch(`/api/liga/equipa/game-sheet/imports/${docId}/reanalyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok || json.analysis_error) setMsg({ ok: false, text: json.error ?? json.analysis_error ?? "Erro na reanálise." });
    await load(); onChanged();
  }

  return (
    <div style={{ marginTop: "10px" }}>
      {data.warnings.length > 0 && (
        <ul style={{ fontSize: "11px", color: "#92400E", background: "#FFFBEB", borderRadius: "8px", padding: "8px 10px 8px 24px", margin: "0 0 8px" }}>
          {data.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      {errors.length > 0 && (
        <div style={{ fontSize: "12px", color: "#B91C1C", background: "#FEF2F2", borderRadius: "8px", padding: "8px 10px", margin: "0 0 8px" }}>
          <strong>Inconsistências matemáticas ({errors.length})</strong> — corrija as células assinaladas ou reanalise:
          <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>{errors.slice(0, 8).map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      )}
      {(["home", "away"] as const).map((side) => {
        const t = data.teams[side];
        if (!t) return null;
        return (
          <div key={side} style={{ marginBottom: "10px" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 4px" }}>
              {game[side]}{t.sheetName && t.sheetName !== game[side] ? ` (no documento: ${t.sheetName})` : ""}
              {t.teamOnly && <span style={{ fontWeight: 400, color: "var(--muted,#6F675F)" }}> — só totais de equipa (sem estatística individual)</span>}
            </p>
            {!t.teamOnly && (
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", border: "1px solid var(--border,#E8E0D4)", borderRadius: "8px" }}>
                <table style={{ borderCollapse: "collapse", fontSize: "11px", minWidth: "640px", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "var(--bg,#F6F2EC)" }}>
                      <th style={{ textAlign: "left", padding: "5px 6px", position: "sticky", left: 0, background: "var(--bg,#F6F2EC)" }}>Jogador</th>
                      {COLS.map(([, l]) => <th key={l} style={{ padding: "5px 3px" }}>{l}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {t.players.map((p) => {
                      const bad = badPlayers.has(p.id);
                      return (
                        <tr key={p.id} style={{ borderTop: "1px solid var(--border,#E8E0D4)", background: bad ? "#FEF2F2" : undefined }}>
                          <td style={{ padding: "4px 6px", whiteSpace: "nowrap", position: "sticky", left: 0, background: bad ? "#FEF2F2" : "var(--card,#fff)" }}>
                            {p.number !== null ? `#${p.number} ` : ""}{p.name}
                            {p.inDatabase === false && <span title="Não consta da base de dados" style={{ marginLeft: 4, color: "#B45309" }}>•novo</span>}
                          </td>
                          {COLS.map(([k]) => {
                            const ill = p.illegible.includes(k);
                            return (
                              <td key={k} style={{ padding: "2px", textAlign: "center" }}>
                                {editable && (bad || ill) ? (
                                  <input
                                    inputMode="numeric" value={p.stats[k] ?? ""} placeholder={ill ? "?" : "—"}
                                    onChange={(e) => setCell(side, p.id, k, e.target.value)}
                                    style={{ width: "34px", padding: "3px", fontSize: "11px", textAlign: "center", border: `1px solid ${ill ? "#F59E0B" : "#FCA5A5"}`, borderRadius: "4px" }}
                                  />
                                ) : (p.stats[k] ?? <span style={{ color: "#B8AFA6" }}>—</span>)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: "2px solid var(--border,#E8E0D4)", fontWeight: 700 }}>
                      <td style={{ padding: "4px 6px", position: "sticky", left: 0, background: "var(--card,#fff)" }}>Totais</td>
                      {COLS.map(([k]) => <td key={k} style={{ textAlign: "center" }}>{t.totals[k] ?? "—"}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {t.teamOnly && <p style={{ fontSize: "11px", margin: 0 }}>Pontos: {t.totals.pts ?? "—"}</p>}
          </div>
        );
      })}
      {data.periods.length > 0 && (
        <p style={{ fontSize: "11px", color: "var(--muted,#6F675F)", margin: "0 0 8px" }}>
          Parciais: {data.periods.map((p) => `P${p.period} ${p.home ?? "?"}-${p.away ?? "?"}`).join(" · ")}
          {data.final.home !== null && ` · Final ${data.final.home}-${data.final.away ?? "?"}`}
        </p>
      )}
      <p style={{ fontSize: "10px", color: "var(--muted,#6F675F)", margin: "0 0 8px" }}>
        “—” = não disponível no documento (não é zero). Só as linhas com problemas são editáveis. Colunas guardadas: {STAT_KEYS.length} possíveis.
      </p>
      {msg && <p style={{ fontSize: "12px", color: msg.ok ? "#15803D" : "#B91C1C", margin: "0 0 8px" }}>{msg.text}</p>}
      {editable && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {dirty && <button onClick={save} disabled={!!busy} style={btn(false, !!busy)}>Guardar correções</button>}
          {status !== "confirmed" && <button onClick={() => confirmDoc(false)} disabled={!!busy} style={{ ...btn(true, !!busy), flex: 1 }}>{busy ?? "Confirmar e submeter"}</button>}
          <button onClick={reanalyze} disabled={!!busy} style={btn(false, !!busy)}>↻ Reanalisar</button>
        </div>
      )}
    </div>
  );
}

function GameDocsPanel({ game, teamName }: { game: PublicGame; teamName: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/liga/equipa/match-docs?game_id=${game.id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Erro ao carregar documentos."); return; }
    setData(json as Overview);
  }, [game.id]);
  useEffect(() => { void load(); }, [load]);

  // Atualiza enquanto há documentos em análise
  useEffect(() => {
    if (!data?.docs.some((d) => d.status === "processing")) return;
    const t = setTimeout(() => void load(), 5000);
    return () => clearTimeout(t);
  }, [data, load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 6);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;
    setError(null);
    let lastId: string | null = null;
    for (let i = 0; i < files.length; i++) {
      setBusy(`A ler ${i + 1}/${files.length} (pode demorar até 1 min)…`);
      const prep = await prepareSheetForUpload(files[i]);
      if ("error" in prep) { setError(`${files[i].name}: ${prep.error}`); continue; }
      const fd = new FormData();
      fd.append("photo", prep.file);
      fd.append("game_id", game.id);
      fd.append("doc_type", "pro_stats");
      const res = await fetch("/api/liga/equipa/game-sheet/imports", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(`${files[i].name}: ${json.error ?? "erro no envio"}`); continue; }
      if (json.analysis_error) setError(`${files[i].name}: ${json.analysis_error} (o ficheiro ficou guardado; pode reanalisar)`);
      lastId = json.id;
    }
    setBusy(null);
    await load();
    if (lastId) setOpenDoc(lastId);
  }

  const official = data?.docs.filter((d) => d.doc_type === "official_sheet") ?? [];
  const pro = data?.docs.filter((d) => d.doc_type === "pro_stats") ?? [];
  const isHome = game.home_team === teamName;

  return (
    <div style={{ padding: "12px 14px 14px", borderTop: "1px solid var(--border,#E8E0D4)" }}>
      {error && <p style={{ fontSize: "12px", color: "#DC2626", background: "#FEF2F2", padding: "8px 10px", borderRadius: "8px", margin: "0 0 10px" }}>{error}</p>}
      {!data ? <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: 0 }}>A carregar…</p> : (
        <>
          {data.validation && (
            <div style={{ fontSize: "12px", padding: "8px 10px", borderRadius: "8px", background: "var(--bg,#F6F2EC)", margin: "0 0 10px", borderLeft: `4px solid ${VALIDATION_COLORS[data.validation.status] ?? "#6B7280"}` }}>
              <strong>Validação do jogo:</strong> {data.validation.label}
              <span style={{ display: "block", color: "var(--muted,#6F675F)", marginTop: 2 }}>
                A tua equipa: {(isHome ? data.validation.teams_submitted.home : data.validation.teams_submitted.away) ? "submetida ✓" : "por submeter"} ·
                Adversário: {(isHome ? data.validation.teams_submitted.away : data.validation.teams_submitted.home) ? "submetido ✓" : "por submeter"}
              </span>
            </div>
          )}

          <p style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 6px" }}>A — Folha de jogo oficial</p>
          {official.length === 0 ? (
            <p style={{ fontSize: "12px", margin: "0 0 12px" }}>
              Ainda não submetida. <a href={`/liga-inatel/equipa?jogo=${game.id}#resultados`} style={{ color: "#F97316", fontWeight: 700 }}>Submeter folha oficial →</a>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
              {official.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", flexWrap: "wrap" }}>
                  <Chip status={d.status} />
                  <span>{d.summary.final?.home != null ? `Resultado lido ${d.summary.final.home}-${d.summary.final.away}` : "Sem resultado lido"}</span>
                  <a href={`/liga-inatel/boletim/${d.id}`} style={{ color: "#F97316", fontWeight: 600 }}>abrir</a>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 6px" }}>B — Estatísticas profissionais <span style={{ fontWeight: 400, color: "var(--muted,#6F675F)" }}>(opcional, recomendado)</span></p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
            {pro.map((d) => (
              <div key={d.id} style={{ border: "1px solid var(--border,#E8E0D4)", borderRadius: "8px", padding: "8px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
                  <Chip status={d.status} />
                  <span style={{ fontWeight: 600 }}>{d.summary.app ?? "Estatísticas"}</span>
                  {d.summary.final?.home != null && <span>{d.summary.final.home}-{d.summary.final.away ?? "?"}</span>}
                  {d.summary.players && <span style={{ color: "var(--muted,#6F675F)" }}>{d.summary.players.home + d.summary.players.away} jogadores</span>}
                  {d.page_count && d.page_count > 1 && <span style={{ color: "var(--muted,#6F675F)" }}>{d.page_count} páginas</span>}
                  {d.image_url && <a href={d.image_url} target="_blank" rel="noopener noreferrer" style={{ color: "#F97316" }}>ficheiro</a>}
                  {d.status !== "processing" && d.status !== "failed" && (
                    <button onClick={() => setOpenDoc(openDoc === d.id ? null : d.id)} style={{ marginLeft: "auto", fontSize: "12px", background: "none", border: "none", color: "#F97316", fontWeight: 700, cursor: "pointer" }}>
                      {openDoc === d.id ? "fechar" : d.status === "confirmed" || d.status === "published" ? "ver" : "rever →"}
                    </button>
                  )}
                </div>
                {d.error && <p style={{ fontSize: "11px", color: "#B91C1C", margin: "6px 0 0" }}>{d.error}</p>}
                {d.status === "failed" && (
                  <button
                    onClick={async () => { setBusy("A reanalisar…"); await fetch(`/api/liga/equipa/game-sheet/imports/${d.id}/reanalyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); setBusy(null); await load(); }}
                    style={{ ...btn(false, !!busy), marginTop: 6, fontSize: "12px" }}
                  >↻ Reanalisar</button>
                )}
                {openDoc === d.id && <ProStatsReview docId={d.id} game={{ home: data.game.home, away: data.game.away }} onChanged={load} />}
              </div>
            ))}
          </div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple style={{ display: "none" }} onChange={upload} />
          <button onClick={() => inputRef.current?.click()} disabled={!!busy} style={{ ...btn(true, !!busy), width: "100%" }}>
            {busy ?? "＋ Carregar estatísticas (imagem ou PDF, vários ficheiros)"}
          </button>
        </>
      )}
    </div>
  );
}

export function DelegateMatchDocs({ games, teamName, preselectedGameId }: Props) {
  const [openId, setOpenId] = useState<string | null>(preselectedGameId && games.some((g) => g.id === preselectedGameId) ? preselectedGameId : null);
  if (games.length === 0) return <p style={{ fontSize: "14px", color: "var(--muted,#6F675F)", padding: "12px 0" }}>Ainda não há jogos realizados.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {games.slice(0, 12).map((g) => {
        const isHome = g.home_team === teamName;
        const open = openId === g.id;
        return (
          <div key={g.id} style={{ borderRadius: "10px", border: open ? "1.5px solid #F97316" : "1px solid var(--border,#E8E0D4)", background: "var(--card,#fff)", overflow: "hidden" }}>
            <button onClick={() => setOpenId(open ? null : g.id)} style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", cursor: "pointer" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isHome ? "vs" : "@"} {isHome ? g.away_team : g.home_team}</span>
                <span style={{ display: "block", fontSize: "12px", color: "var(--muted,#6F675F)" }}>{fmt(g.event_date)}{g.result ? ` · ${g.result.home_score}–${g.result.away_score}` : g.result_status === "pending" ? " · em validação" : ""}</span>
              </span>
              <span style={{ fontSize: "12px", color: "#F97316", fontWeight: 700 }}>{open ? "▲" : "Documentos ▼"}</span>
            </button>
            {open && <GameDocsPanel game={g} teamName={teamName} />}
          </div>
        );
      })}
    </div>
  );
}
