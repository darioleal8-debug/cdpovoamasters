"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, Loader2 } from "lucide-react";
import { UsageDashboard } from "@/components/hoophub/usage-dashboard";

interface SiteData {
  period_days: number;
  overview: { delegate_views: number; delegate_sessions: number; active_delegates: number; team_page_views: number; team_page_visitors: number; last_seen: string | null };
  daily: { date: string; delegate_views: number; team_page_views: number }[];
  pages: { path: string; views: number }[];
  users: { user_id: string; name: string | null; email: string | null; views: number; sessions: number; last_seen: string }[];
}
interface TeamData {
  name: string; sigla: string | null;
  club: { id: string; name: string; active: boolean } | null;
  site: SiteData | null; site_error: string | null;
}

const PERIODS = [{ label: "7 dias", value: 7 }, { label: "30 dias", value: 30 }, { label: "90 dias", value: 90 }, { label: "1 ano", value: 365 }];
const fmtDT = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function TeamAnalytics({ league, team }: { league: string; team: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/master/league-teams/${team}?days=${days}`);
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? "Erro ao carregar");
      setData(json);
    } catch { setError("Erro de rede"); }
  }, [team, days]);
  useEffect(() => { load(); }, [load]);

  const leagueName = decodeURIComponent(league);
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const s = data.site;
  const daily = (s?.daily ?? []).map((d) => ({ ...d, label: new Date(d.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }) }));

  return (
    <div className="space-y-6">
      <Link href={`/hoophub/ligas/${encodeURIComponent(leagueName)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3 w-3" /> {leagueName}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-condensed text-2xl font-bold uppercase tracking-display">{data.name}</h1>
        {s || data.site_error ? (
          <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setDays(p.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${days === p.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{p.label}</button>
            ))}
          </div>
        ) : null}
      </div>

      {(s || data.site_error) && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Site da Liga — atividade da equipa</h2>
          {data.site_error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">Não foi possível carregar ({data.site_error}). A migração 144 ainda não foi aplicada?</p>}
          {s && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Kpi label="Delegados ativos" value={s.overview.active_delegates} />
                <Kpi label="Visitas dos delegados" value={s.overview.delegate_views} sub={`${s.overview.delegate_sessions} sessões`} />
                <Kpi label="Visitas à página da equipa" value={s.overview.team_page_views} sub={`${s.overview.team_page_visitors} visitantes`} />
                <Kpi label="Último acesso" value={fmtDT(s.overview.last_seen)} />
              </div>
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold">Atividade diária</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.15)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="delegate_views" name="Delegados" stroke="#F97316" fill="#F97316" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="team_page_views" name="Página da equipa" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="overflow-hidden rounded-xl border bg-card">
                  <h3 className="border-b px-5 py-3 text-sm font-semibold">Delegados</h3>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {s.users.map((u) => (
                        <tr key={u.user_id}>
                          <td className="px-4 py-2"><p className="font-medium">{u.name ?? u.email}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
                          <td className="px-4 py-2 text-right tabular-nums">{u.views} <span className="text-xs text-muted-foreground">visitas</span></td>
                          <td className="hidden px-4 py-2 text-right text-xs text-muted-foreground sm:table-cell">{fmtDT(u.last_seen)}</td>
                        </tr>
                      ))}
                      {s.users.length === 0 && <tr><td className="px-4 py-8 text-center text-sm text-muted-foreground">Sem atividade neste período.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-hidden rounded-xl border bg-card">
                  <h3 className="border-b px-5 py-3 text-sm font-semibold">Páginas mais vistas pelos delegados</h3>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {s.pages.map((p) => (
                        <tr key={p.path}><td className="truncate px-4 py-2 text-xs">{p.path}</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{p.views}</td></tr>
                      ))}
                      {s.pages.length === 0 && <tr><td className="px-4 py-8 text-center text-sm text-muted-foreground">Sem dados.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">App de gestão HoopHub</h2>
        {data.club ? (
          <UsageDashboard lockedClub={data.club.id} title={`Utilização — ${data.club.name}`} />
        ) : (
          <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Esta equipa ainda não tem clube na app de gestão.</p>
        )}
      </section>
    </div>
  );
}
