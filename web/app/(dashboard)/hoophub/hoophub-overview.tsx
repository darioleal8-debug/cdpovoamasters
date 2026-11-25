"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Building2, Inbox, Loader2, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClubRow { id: string; name: string; active: boolean; league: string | null; members: number; active_users: number; events: number; last_seen: string | null }
interface LeagueRow { name: string; clubs: number; active_clubs: number; members: number; teams?: number; teams_without_club?: number }
interface Overview {
  period_days: number;
  totals: { clubs: number; active_clubs: number; users: number; events: number; active_week: number; pending_requests: number };
  clubs: ClubRow[];
  leagues: LeagueRow[];
}

const PERIODS = [
  { label: "7 dias", value: 7 }, { label: "30 dias", value: 30 }, { label: "90 dias", value: 90 }, { label: "1 ano", value: 365 },
];

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function Kpi({ icon: Icon, label, value, sub, href }: { icon: React.ElementType; label: string; value: string | number; sub?: string; href?: string }) {
  const body = (
    <div className="flex h-full items-start gap-3 rounded-xl border bg-card p-4">
      <div className="mt-0.5 rounded-lg bg-muted p-2"><Icon className="h-4 w-4 text-muted-foreground" /></div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block transition-opacity hover:opacity-80">{body}</Link> : body;
}

export function HoopHubOverview() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/master/overview?days=${days}`);
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? "Erro ao carregar");
      setData(json);
    } catch { setError("Erro de rede"); }
  }, [days]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (error) return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
      <p className="font-semibold text-destructive">{error}</p>
      <button onClick={load} className="mt-3 text-sm underline">Tentar novamente</button>
    </div>
  );
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const { totals, clubs, leagues } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-display">Visão geral da plataforma</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Todos os clubes e ligas do HoopHub. O teu clube (CD Póvoa) continua acessível no resto do menu.</p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setDays(p.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${days === p.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Building2} label="Clubes" value={totals.clubs} sub={`${totals.active_clubs} ativos`} href="/master-clubes" />
        <Kpi icon={Users} label="Utilizadores" value={totals.users} sub="com acesso a um clube" />
        <Kpi icon={Activity} label="Ativos esta semana" value={totals.active_week} href="/utilizacao" />
        <Kpi icon={Activity} label="Interações" value={totals.events.toLocaleString("pt-PT")} sub={`últimos ${days} dias`} href="/utilizacao" />
        <Kpi icon={Inbox} label="Pedidos pendentes" value={totals.pending_requests} href="/master-pedidos" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <Building2 className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold">Utilização por clube</h2>
          <Link href="/utilizacao" className="ml-auto text-xs underline">Análise detalhada</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Clube</th>
                <th className="hidden px-4 py-2.5 text-left md:table-cell">Liga</th>
                <th className="px-4 py-2.5 text-right">Utilizadores</th>
                <th className="px-4 py-2.5 text-right">Com atividade</th>
                <th className="px-4 py-2.5 text-right">Interações</th>
                <th className="hidden px-4 py-2.5 text-right sm:table-cell">Último acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clubs.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <Link href={`/utilizacao?club=${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <Badge variant={c.active ? "default" : "secondary"} className="ml-2">{c.active ? "Ativo" : "Inativo"}</Badge>
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">{c.league ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.members}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.active_users}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">{c.events.toLocaleString("pt-PT")}</td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted-foreground sm:table-cell">{fmtDate(c.last_seen)}</td>
                </tr>
              ))}
              {clubs.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Sem clubes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <Trophy className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold">Ligas</h2>
          <Link href="/liga" className="ml-auto text-xs underline">Equipas da Liga INATEL</Link>
        </div>
        <div className="divide-y">
          {leagues.map((l) => (
            <div key={l.name} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="font-medium">{l.name}</span>
              <span className="text-xs text-muted-foreground">
                {l.teams !== undefined && <>{l.teams} equipas · {l.teams_without_club} sem clube na app · </>}
                {l.clubs} clube(s) na app ({l.active_clubs} ativos) · {l.members} utilizador(es)
              </span>
            </div>
          ))}
          {leagues.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sem ligas associadas.</p>}
        </div>
      </div>
    </div>
  );
}
