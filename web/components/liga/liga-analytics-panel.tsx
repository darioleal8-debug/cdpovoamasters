"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

// ─── Tipos (espelham public.liga_analytics) ──────────────────────────────────

type Overview = {
  views: number; views_anon: number; views_registered: number;
  visitors: number; visitors_anon: number; registered_users: number;
  sessions: number; pwa_views: number; avg_duration_s: number | null;
  views_today: number; visitors_today: number;
  new_visitors: number; returning_visitors: number;
  prev_views: number; prev_visitors: number;
};

type Analytics = {
  period_days: number;
  overview: Overview;
  daily: { date: string; views_anon: number; views_registered: number; visitors: number }[];
  hours: { hour: number; views: number }[];
  pages: { path: string; views: number; visitors: number }[];
  user_kinds: { kind: string; views: number; visitors: number }[];
  devices: { device: string; views: number; visitors: number }[];
  referrers: { source: string; views: number }[];
  countries: { country: string; visitors: number }[];
  users: {
    user_id: string; name: string | null; email: string | null; kind: string;
    team: string | null; views: number; sessions: number; last_seen: string;
  }[];
};

// ─── Estilo (alinhado com o painel da Liga) ──────────────────────────────────

const C = {
  ink: "#1A1612", muted: "#8C837A", line: "#E8E0D6", card: "#FFFDFA",
  orange: "#F97316", navy: "#1E2A44", soft: "#FED7AA",
};

const card: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 16,
};

const h3: React.CSSProperties = {
  fontFamily: "var(--font-bc-heavy, sans-serif)", fontSize: 14, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: "0.05em", color: C.ink, margin: "0 0 12px",
};

const KIND_LABELS: Record<string, string> = {
  anonimo: "Anónimos", delegado: "Delegados de equipa", admin: "Admin da Liga",
  clube: "Utilizadores de clube", registado: "Outros registados",
};

const DEVICE_LABELS: Record<string, string> = {
  mobile: "Telemóvel", tablet: "Tablet", desktop: "Computador", desconhecido: "Desconhecido",
};

function pageLabel(path: string): string {
  const p = path.replace(/^\/liga-inatel/, "") || "/";
  if (p === "/") return "Início";
  const map: [RegExp, string][] = [
    [/^\/classificacao/, "Classificação"],
    [/^\/calendario/, "Calendário"],
    [/^\/resultados/, "Resultados"],
    [/^\/noticias\/?$/, "Notícias"],
    [/^\/jogo\//, "Ficha de jogo"],
    [/^\/equipas\/?$/, "Equipas"],
    [/^\/equipa\/login/, "Login de equipa"],
    [/^\/equipa/, "Área de equipa"],
    [/^\/boletim/, "Boletim"],
    [/^\/conta/, "Conta"],
    [/^\/redefinir-password/, "Redefinir password"],
  ];
  for (const [re, label] of map) if (re.test(p)) return label;
  const news = p.match(/^\/noticias\/(.+)/);
  if (news) return "Notícia · " + decodeURIComponent(news[1]).replace(/-/g, " ");
  const team = p.match(/^\/equipas\/(.+)/);
  if (team) return "Equipa · " + decodeURIComponent(team[1]).replace(/-/g, " ");
  return p;
}

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-PT");
}

function fmtDuration(s: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function delta(cur: number, prev: number) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function relTime(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `há ${h} h`;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

function flag(cc: string) {
  if (!/^[A-Z]{2}$/.test(cc)) return "🌐";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, change }: { label: string; value: string; sub?: string; change?: number | null }) {
  return (
    <div style={{ ...card, padding: "14px 16px" }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontFamily: "var(--font-bc-heavy, sans-serif)", fontSize: 28, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{value}</p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, minHeight: 16 }}>
        {change != null && (
          <span style={{ color: change >= 0 ? "#15803D" : "#B91C1C", fontWeight: 700, marginRight: 6 }}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
          </span>
        )}
        {sub}
      </p>
    </div>
  );
}

function BarList({ rows, valueLabel }: { rows: { label: string; value: number; extra?: string }[]; valueLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Sem dados no período.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ position: "relative", padding: "6px 10px", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, width: `${(r.value / max) * 100}%`, background: "#FFF1E6", borderRadius: 6 }} />
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>{r.label}</span>
            <span style={{ color: C.ink, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {fmt(r.value)}{valueLabel ? ` ${valueLabel}` : ""}
              {r.extra && <span style={{ color: C.muted, fontWeight: 500 }}> · {r.extra}</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Painel ──────────────────────────────────────────────────────────────────

export function LigaAnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/liga/admin/analytics?days=${days}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Erro ao carregar estatísticas");
      setData(j as Analytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar estatísticas");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const o = data?.overview;
  const tickEvery = data ? Math.max(1, Math.ceil(data.daily.length / 10)) : 1;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-bc-heavy, sans-serif)", fontSize: 18, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.ink, margin: 0 }}>
          Estatísticas de utilização
        </h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[7, 30, 90, 365].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              style={{
                fontSize: 12, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 700,
                border: `1px solid ${days === d ? C.orange : C.line}`,
                background: days === d ? "#FFF1E6" : C.card,
                color: days === d ? C.orange : C.muted,
              }}>
              {d === 365 ? "12 meses" : `${d} dias`}
            </button>
          ))}
          <button onClick={load} disabled={loading}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.line}`, background: C.card, cursor: "pointer", color: C.muted }}>
            {loading ? "A carregar…" : "Atualizar"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#B91C1C", fontSize: 14 }}>{error}</p>}
      {!data && loading && <p style={{ color: C.muted, fontSize: 14 }}>A carregar estatísticas…</p>}

      {data && o && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: loading ? 0.6 : 1 }}>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <Kpi label="Visitantes únicos" value={fmt(o.visitors)} change={delta(o.visitors, o.prev_visitors)} sub={`hoje ${fmt(o.visitors_today)}`} />
            <Kpi label="Páginas vistas" value={fmt(o.views)} change={delta(o.views, o.prev_views)} sub={`hoje ${fmt(o.views_today)}`} />
            <Kpi label="Anónimos" value={fmt(o.visitors_anon)} sub={`${fmt(o.views_anon)} páginas`} />
            <Kpi label="Registados" value={fmt(o.registered_users)} sub={`${fmt(o.views_registered)} páginas`} />
            <Kpi label="Visitas (sessões)" value={fmt(o.sessions)} sub={o.sessions ? `${(o.views / o.sessions).toFixed(1)} páginas/visita` : undefined} />
            <Kpi label="Tempo médio/página" value={fmtDuration(o.avg_duration_s)} />
            <Kpi label="Novos vs. recorrentes" value={`${fmt(o.new_visitors)} / ${fmt(o.returning_visitors)}`} />
            <Kpi label="Via app (ecrã principal)" value={o.views ? `${Math.round((o.pwa_views / o.views) * 100)}%` : "—"} sub={`${fmt(o.pwa_views)} páginas`} />
          </div>
          <p style={{ margin: "-4px 0 0", fontSize: 12, color: C.muted }}>
            Variação face aos {data.period_days} dias anteriores. Visitas do admin no painel não são contadas.
          </p>

          {/* Diário */}
          <div style={card}>
            <h3 style={h3}>Páginas vistas por dia</h3>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={data.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.line} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.muted }} interval={tickEvery - 1}
                    tickFormatter={(d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} />
                  <Tooltip
                    labelFormatter={(d) => new Date(String(d) + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" })}
                    formatter={(v, name) => [fmt(Number(v)), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="views_anon" name="Anónimos" stackId="v" fill={C.orange} />
                  <Bar dataKey="views_registered" name="Registados" stackId="v" fill={C.navy} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div style={card}>
              <h3 style={h3}>Páginas mais vistas</h3>
              <BarList rows={data.pages.map((p) => ({ label: pageLabel(p.path), value: p.views, extra: `${fmt(p.visitors)} vis.` }))} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={card}>
                <h3 style={h3}>Tipo de visitante</h3>
                <BarList rows={data.user_kinds.map((k) => ({ label: KIND_LABELS[k.kind] ?? k.kind, value: k.visitors, extra: `${fmt(k.views)} pág.` }))} />
              </div>
              <div style={card}>
                <h3 style={h3}>Dispositivo</h3>
                <BarList rows={data.devices.map((d) => ({ label: DEVICE_LABELS[d.device] ?? d.device, value: d.visitors, extra: `${fmt(d.views)} pág.` }))} />
              </div>
            </div>

            <div style={card}>
              <h3 style={h3}>Hora do dia</h3>
              <div style={{ width: "100%", height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={data.hours} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: C.muted }} interval={2} tickFormatter={(h: number) => `${h}h`} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.muted }} />
                    <Tooltip labelFormatter={(h) => `${h}h–${Number(h) + 1}h`} formatter={(v) => [fmt(Number(v)), "Páginas"]} />
                    <Bar dataKey="views" fill={C.orange} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={card}>
                <h3 style={h3}>Origem</h3>
                <BarList rows={data.referrers.map((r) => ({ label: r.source === "direto" ? "Direto / app / link partilhado" : r.source, value: r.views }))} />
              </div>
              <div style={card}>
                <h3 style={h3}>País</h3>
                <BarList rows={data.countries.map((c) => ({ label: `${flag(c.country)} ${c.country === "??" ? "Desconhecido" : c.country}`, value: c.visitors }))} />
              </div>
            </div>
          </div>

          {/* Utilizadores registados */}
          <div style={card}>
            <h3 style={h3}>Utilizadores registados ({fmt(data.users.length)})</h3>
            {data.users.length === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Nenhum utilizador registado visitou a Liga neste período.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <th style={{ padding: "6px 8px" }}>Utilizador</th>
                      <th style={{ padding: "6px 8px" }}>Tipo</th>
                      <th style={{ padding: "6px 8px" }}>Equipa</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Visitas</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Páginas</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Último acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.user_id} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={{ padding: "8px" }}>
                          <div style={{ fontWeight: 700, color: C.ink }}>{u.name ?? u.email ?? "—"}</div>
                          {u.email && u.name !== u.email && <div style={{ fontSize: 11, color: C.muted }}>{u.email}</div>}
                        </td>
                        <td style={{ padding: "8px", color: C.ink }}>{KIND_LABELS[u.kind] ?? u.kind}</td>
                        <td style={{ padding: "8px", color: C.ink }}>{u.team ?? "—"}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(u.sessions)}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmt(u.views)}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>{relTime(u.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
