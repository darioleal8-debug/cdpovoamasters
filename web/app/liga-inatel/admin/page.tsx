"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Submission = {
  id: string; event_id: string; status: string;
  home_team_name: string; away_team_name: string;
  home_score: number; away_score: number;
  submitted_by_name: string; submitted_by_team: string | null;
  submitted_at: string; notes: string | null;
};

type AdminGame = {
  id: string; event_date: string; event_time: string | null;
  location: string | null; home_team: string; away_team: string;
  jornada: number | null; volta: number | null;
  result: { home_score: number; away_score: number } | null;
  result_status: "no_result" | "pending" | "approved";
  pending_count: number;
  submissions: Submission[];
};

type AuditRecord = {
  id: string; jogo_id: string; alterado_por: string | null;
  valor_antigo: Record<string, unknown> | null;
  valor_novo: Record<string, unknown>;
  motivo: string; created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string, t: string | null) {
  const dt = new Date(d + "T12:00:00");
  const day = dt.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
  return t ? `${day} ${t.slice(0, 5)}` : day;
}

const STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  no_result: { label: "Sem resultado", bg: "#F3F4F6", color: "#6B7280" },
  pending:   { label: "Pendente",      bg: "#FEF3C7", color: "#92400E" },
  approved:  { label: "Aprovado",      bg: "#D1FAE5", color: "#065F46" },
};

function Chip({ status }: { status: string }) {
  const s = STATUS_CHIP[status] ?? STATUS_CHIP.no_result;
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, padding: "3px 8px",
      borderRadius: "99px", background: s.bg, color: s.color,
      letterSpacing: "0.06em", textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LigaAdminPage() {
  const router = useRouter();
  const [games, setGames]             = useState<AdminGame[]>([]);
  const [competitionId, setCompId]    = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Filters
  const [filterJornada, setFilterJornada] = useState<number | "all">("all");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");
  const [filterTeam,    setFilterTeam]    = useState<string>("all");

  // Selected game for inline edit
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [audit, setAudit]             = useState<AuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Edit form
  const [editHome, setEditHome]       = useState("");
  const [editAway, setEditAway]       = useState("");
  const [editMotivo, setEditMotivo]   = useState("");
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState<string | null>(null);

  // Submission action
  const [subActing, setSubActing]     = useState<string | null>(null);
  const [subMotivo, setSubMotivo]     = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/liga/admin/games");
      if (res.status === 401 || res.status === 403) {
        router.push("/liga-inatel/equipa/login?msg=admin_required");
        return;
      }
      if (!res.ok) { setError("Erro ao carregar jogos."); return; }
      const json = await res.json();
      setGames(json.games ?? []);
      setCompId(json.competition_id ?? null);
    } catch { setError("Erro de rede."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function loadAudit(eventId: string) {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/liga/admin/games/${eventId}/audit`);
      const json = await res.json();
      setAudit(json.audit ?? []);
    } finally { setAuditLoading(false); }
  }

  function selectGame(game: AdminGame) {
    const same = selectedId === game.id;
    setSelectedId(same ? null : game.id);
    setAudit([]);
    setSaveMsg(null);
    if (!same) {
      setEditHome(game.result ? String(game.result.home_score) : "");
      setEditAway(game.result ? String(game.result.away_score) : "");
      setEditMotivo("");
      loadAudit(game.id);
    }
  }

  async function handleSaveResult(game: AdminGame) {
    if (!editMotivo.trim()) { setSaveMsg("Motivo obrigatório."); return; }
    const hs = parseInt(editHome, 10);
    const as_ = parseInt(editAway, 10);
    if (isNaN(hs) || isNaN(as_)) { setSaveMsg("Pontuação inválida."); return; }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/liga/admin/games/${game.id}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home_score: hs, away_score: as_, motivo: editMotivo }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveMsg(json.error ?? "Erro ao guardar."); return; }
      setSaveMsg("✓ Resultado guardado.");
      setEditMotivo("");
      await load();
      await loadAudit(game.id);
    } finally { setSaving(false); }
  }

  async function handleSubAction(subId: string, action: "approve" | "reject", eventId: string) {
    const motivo = subMotivo[subId]?.trim();
    if (!motivo) { alert("Motivo obrigatório para esta acção."); return; }
    setSubActing(subId);
    try {
      const res = await fetch(`/api/liga/admin/submissions/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, motivo }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      await load();
      await loadAudit(eventId);
    } finally { setSubActing(null); }
  }

  // Derived data for filters
  const jornadas = [...new Set(games.map(g => g.jornada).filter(Boolean) as number[])].sort((a,b) => a-b);
  const teams = [...new Set([...games.map(g => g.home_team), ...games.map(g => g.away_team)])].sort();

  const filtered = games.filter(g => {
    if (filterJornada !== "all" && g.jornada !== filterJornada) return false;
    if (filterStatus  !== "all" && g.result_status !== filterStatus) return false;
    if (filterTeam    !== "all" && g.home_team !== filterTeam && g.away_team !== filterTeam) return false;
    return true;
  });

  const selectedGame = games.find(g => g.id === selectedId) ?? null;

  if (loading) return (
    <div style={{ padding: "80px 20px", textAlign: "center", color: "#6F675F", fontSize: "14px" }}>
      A carregar jogos…
    </div>
  );

  if (error) return (
    <div style={{ padding: "80px 20px", textAlign: "center", color: "#DC2626", fontSize: "14px" }}>{error}</div>
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px 64px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "24px" }}>
        <div>
          <p style={{
            fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px",
            fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "#F97316", margin: "0 0 4px",
          }}>LIGA INATEL · SUPER-ADMIN</p>
          <h1 style={{
            fontFamily: "var(--font-bc-heavy, sans-serif)", fontWeight: 800,
            fontSize: "clamp(24px, 5vw, 36px)", letterSpacing: "0.04em",
            textTransform: "uppercase", color: "#1A1612", margin: 0,
          }}>Painel de Administração</h1>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link
            href="/liga-inatel"
            style={{ fontSize: "12px", color: "#8C837A", textDecoration: "none" }}
          >
            ← Liga INATEL
          </Link>
          <span style={{ color: "#D1C9C0" }}>·</span>
          <SignOutBtn />
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px",
        padding: "12px 16px", background: "#FFFDFA",
        borderRadius: "8px", border: "1px solid #E8E0D6",
      }}>
        <select
          value={filterJornada === "all" ? "all" : String(filterJornada)}
          onChange={e => setFilterJornada(e.target.value === "all" ? "all" : Number(e.target.value))}
          style={selectStyle}
        >
          <option value="all">Todas as jornadas</option>
          {jornadas.map(j => <option key={j} value={j}>Jornada {j}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">Todos os estados</option>
          <option value="no_result">Sem resultado</option>
          <option value="pending">Pendente</option>
          <option value="approved">Aprovado</option>
        </select>

        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={selectStyle}>
          <option value="all">Todas as equipas</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <span style={{ fontSize: "12px", color: "#8C837A", alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length}/{games.length} jogos
        </span>
      </div>

      {/* Game list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#8C837A", fontSize: "14px", padding: "40px 0" }}>
            Nenhum jogo encontrado com estes filtros.
          </p>
        )}

        {filtered.map(game => {
          const isSelected = selectedId === game.id;
          return (
            <div key={game.id} style={{
              borderRadius: "8px", border: `1px solid ${isSelected ? "#F97316" : "#E8E0D6"}`,
              background: "#FFFDFA", overflow: "hidden",
              boxShadow: isSelected ? "0 0 0 2px rgba(249,115,22,.15)" : undefined,
            }}>
              {/* Game row */}
              <button
                onClick={() => selectGame(game)}
                style={{
                  display: "flex", alignItems: "center", gap: "12px", width: "100%",
                  padding: "12px 16px", background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  width: "40px", textAlign: "center", flexShrink: 0,
                  fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px",
                  fontWeight: 600, color: "#F97316", letterSpacing: "0.08em",
                }}>
                  J{game.jornada ?? "?"}
                  {game.volta ? <div style={{ fontSize: "9px", color: "#B9AFA4" }}>V{game.volta}</div> : null}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: "14px", color: "#1A1612",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {game.home_team} <span style={{ color: "#8C837A", fontWeight: 400 }}>vs</span> {game.away_team}
                  </div>
                  <div style={{ fontSize: "11px", color: "#8C837A", marginTop: "1px" }}>
                    {fmtDate(game.event_date, game.event_time)}
                    {game.location ? ` · ${game.location}` : ""}
                  </div>
                </div>

                {game.result && (
                  <div style={{
                    fontFamily: "var(--font-ibm-mono, monospace)", fontWeight: 700,
                    fontSize: "16px", color: "#1A1612", flexShrink: 0,
                    letterSpacing: "0.04em",
                  }}>
                    {game.result.home_score}–{game.result.away_score}
                  </div>
                )}

                <div style={{ flexShrink: 0, display: "flex", gap: "6px", alignItems: "center" }}>
                  <Chip status={game.result_status} />
                  {game.pending_count > 0 && (
                    <span style={{
                      background: "#F97316", color: "#fff",
                      borderRadius: "99px", fontSize: "10px", fontWeight: 700,
                      padding: "1px 7px",
                    }}>{game.pending_count}</span>
                  )}
                </div>

                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
                  transform: isSelected ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform .15s", flexShrink: 0, opacity: 0.5,
                }}>
                  <path d="M4 2l4 4-4 4" stroke="#1A1612" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Expanded detail */}
              {isSelected && selectedGame && (
                <div style={{ padding: "0 16px 20px", borderTop: "1px solid #F0EAE1" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", paddingTop: "16px" }}>

                    {/* Edit form */}
                    <div>
                      <h3 style={sectionTitle}>Editar resultado</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <label style={labelStyle}>{selectedGame.home_team}</label>
                          <input
                            type="number" min={0} value={editHome}
                            onChange={e => setEditHome(e.target.value)}
                            style={inputStyle}
                            placeholder="Pontos"
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>{selectedGame.away_team}</label>
                          <input
                            type="number" min={0} value={editAway}
                            onChange={e => setEditAway(e.target.value)}
                            style={inputStyle}
                            placeholder="Pontos"
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: "8px" }}>
                        <label style={labelStyle}>Motivo da correção *</label>
                        <input
                          type="text" value={editMotivo}
                          onChange={e => setEditMotivo(e.target.value)}
                          placeholder="Ex: Correção de erro de transcrição"
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                        />
                      </div>
                      {saveMsg && (
                        <p style={{
                          fontSize: "12px", margin: "0 0 8px",
                          color: saveMsg.startsWith("✓") ? "#065F46" : "#DC2626",
                        }}>{saveMsg}</p>
                      )}
                      <button
                        onClick={() => handleSaveResult(selectedGame)}
                        disabled={saving}
                        style={{
                          padding: "8px 16px", background: saving ? "#D1C9C0" : "#F97316",
                          color: "#fff", fontWeight: 700, fontSize: "13px",
                          border: "none", borderRadius: "6px", cursor: saving ? "not-allowed" : "pointer",
                        }}
                      >
                        {saving ? "A guardar…" : "Guardar resultado"}
                      </button>
                    </div>

                    {/* Submissions */}
                    <div>
                      <h3 style={sectionTitle}>Submissões ({selectedGame.submissions.length})</h3>
                      {selectedGame.submissions.length === 0 ? (
                        <p style={{ fontSize: "13px", color: "#8C837A" }}>Sem submissões.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {selectedGame.submissions.map((sub) => (
                            <div key={sub.id} style={{
                              padding: "10px 12px", background: "#F6F2EC",
                              borderRadius: "6px", fontSize: "13px",
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span style={{ fontWeight: 600 }}>
                                  {sub.home_score}–{sub.away_score}
                                </span>
                                <Chip status={sub.status} />
                              </div>
                              <div style={{ color: "#6B7280", fontSize: "11px", marginBottom: "6px" }}>
                                {sub.submitted_by_name}{sub.submitted_by_team ? ` · ${sub.submitted_by_team}` : ""}
                                {" · "}{new Date(sub.submitted_at).toLocaleDateString("pt-PT")}
                              </div>
                              {sub.notes && (
                                <p style={{ fontSize: "11px", color: "#6B7280", margin: "0 0 6px" }}>
                                  Nota: {sub.notes}
                                </p>
                              )}
                              {sub.status === "pending" && (
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                                  <input
                                    type="text"
                                    placeholder="Motivo *"
                                    value={subMotivo[sub.id] ?? ""}
                                    onChange={e => setSubMotivo(m => ({ ...m, [sub.id]: e.target.value }))}
                                    style={{ ...inputStyle, flex: 1, minWidth: "120px", fontSize: "11px", padding: "5px 8px" }}
                                  />
                                  <button
                                    onClick={() => handleSubAction(sub.id, "approve", selectedGame.id)}
                                    disabled={subActing === sub.id}
                                    style={{ padding: "5px 10px", background: "#16A34A", color: "#fff", fontWeight: 700, fontSize: "11px", border: "none", borderRadius: "5px", cursor: "pointer" }}
                                  >
                                    ✓ Aprovar
                                  </button>
                                  <button
                                    onClick={() => handleSubAction(sub.id, "reject", selectedGame.id)}
                                    disabled={subActing === sub.id}
                                    style={{ padding: "5px 10px", background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: "11px", border: "none", borderRadius: "5px", cursor: "pointer" }}
                                  >
                                    ✗ Rejeitar
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Audit */}
                  <div style={{ marginTop: "16px" }}>
                    <h3 style={sectionTitle}>Histórico de alterações</h3>
                    {auditLoading ? (
                      <p style={{ fontSize: "12px", color: "#8C837A" }}>A carregar…</p>
                    ) : audit.length === 0 ? (
                      <p style={{ fontSize: "12px", color: "#8C837A" }}>Sem alterações registadas.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {audit.map(a => (
                          <div key={a.id} style={{
                            display: "flex", gap: "12px", alignItems: "flex-start",
                            fontSize: "12px", color: "#6B7280",
                            padding: "8px 0", borderTop: "1px solid #F0EAE1",
                          }}>
                            <span style={{ color: "#B9AFA4", fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", flexShrink: 0 }}>
                              {new Date(a.created_at).toLocaleString("pt-PT")}
                            </span>
                            <div>
                              <span style={{ color: "#1A1612", fontWeight: 600 }}>
                                {a.valor_antigo
                                  ? `${(a.valor_antigo as {home_score?: number}).home_score ?? "?"} – ${(a.valor_antigo as {away_score?: number}).away_score ?? "?"} → `
                                  : ""}
                                {(a.valor_novo as {home_score?: number}).home_score !== undefined
                                  ? `${(a.valor_novo as {home_score: number}).home_score} – ${(a.valor_novo as {away_score: number}).away_score}`
                                  : JSON.stringify(a.valor_novo)}
                              </span>
                              {" · "}
                              <em>{a.motivo}</em>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function SignOutBtn() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function handleSignOut() {
    setLoading(true);
    await fetch("/api/liga/auth/signout", { method: "POST" });
    router.push("/liga-inatel/equipa/login");
    router.refresh();
    setLoading(false);
  }
  return (
    <button onClick={handleSignOut} disabled={loading}
      style={{ fontSize: "12px", color: "#8C837A", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      {loading ? "A sair…" : "Terminar sessão"}
    </button>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-ibm-mono, monospace)",
  fontSize: "10px", fontWeight: 600,
  letterSpacing: "0.12em", textTransform: "uppercase",
  color: "#8C837A", margin: "0 0 10px",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 600,
  color: "#6B7280", marginBottom: "4px",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "7px 10px", fontSize: "13px",
  border: "1.5px solid #E8E0D6", borderRadius: "6px",
  background: "#FFFDFA", color: "#1A1612", outline: "none",
};

const selectStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: "12px",
  border: "1.5px solid #E8E0D6", borderRadius: "6px",
  background: "#FFFDFA", color: "#1A1612", cursor: "pointer",
};
