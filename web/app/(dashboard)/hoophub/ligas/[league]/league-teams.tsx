"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TeamRow {
  key: string; name: string; sigla: string | null;
  club: { id: string; name: string; active: boolean } | null;
  app: { members: number; active_users: number; events: number; last_seen: string | null } | null;
  site: { delegate_views: number; active_delegates: number; team_page_views: number; last_seen: string | null } | null;
}
interface Data { league: string; kind: "inatel" | "outra"; period_days: number; site_error: string | null; teams: TeamRow[] }

const PERIODS = [{ label: "7 dias", value: 7 }, { label: "30 dias", value: 30 }, { label: "90 dias", value: 90 }, { label: "1 ano", value: 365 }];
const fmt = (n: number) => n.toLocaleString("pt-PT");
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }) : "—");
const lastOf = (t: TeamRow) => [t.app?.last_seen, t.site?.last_seen].filter(Boolean).sort().pop() ?? null;

export function LeagueTeams({ league }: { league: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/master/leagues/${league}?days=${days}`);
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? "Erro ao carregar");
      setData(json);
    } catch { setError("Erro de rede"); }
  }, [league, days]);
  useEffect(() => { setData(null); load(); }, [load]);

  const name = decodeURIComponent(league);
  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const inatel = data.kind === "inatel";
  const ranked = [...data.teams].sort((a, b) => ((b.app?.events ?? 0) + (b.site?.delegate_views ?? 0)) - ((a.app?.events ?? 0) + (a.site?.delegate_views ?? 0)));

  return (
    <div className="space-y-4">
      <Link href="/hoophub/ligas" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" /> Ligas</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-display">{name}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Clica numa equipa para ver as analytics completas.</p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setDays(p.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${days === p.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      {data.site_error && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          As analytics do site da Liga não estão disponíveis ({data.site_error}). A migração 144 ainda não foi aplicada?
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs font-semibold text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Equipa</th>
              <th className="px-4 py-2.5 text-right">Utilizadores app</th>
              <th className="px-4 py-2.5 text-right">Interações app</th>
              {inatel && <th className="px-4 py-2.5 text-right">Delegados ativos</th>}
              {inatel && <th className="px-4 py-2.5 text-right">Visitas delegados</th>}
              {inatel && <th className="px-4 py-2.5 text-right">Visitas à página</th>}
              <th className="hidden px-4 py-2.5 text-right sm:table-cell">Último acesso</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ranked.map((t) => (
              <tr key={t.key} className="hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <Link href={`/hoophub/ligas/${encodeURIComponent(name)}/${t.key}`} className="font-medium hover:underline">{t.name}</Link>
                  {t.club ? <Badge variant={t.club.active ? "default" : "secondary"} className="ml-2">{t.club.active ? "Na app" : "Clube inativo"}</Badge>
                    : <Badge variant="outline" className="ml-2">Sem app</Badge>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{t.app ? `${t.app.active_users}/${t.app.members}` : "—"}</td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums">{t.app ? fmt(t.app.events) : "—"}</td>
                {inatel && <td className="px-4 py-2.5 text-right tabular-nums">{t.site?.active_delegates ?? 0}</td>}
                {inatel && <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.site?.delegate_views ?? 0)}</td>}
                {inatel && <td className="px-4 py-2.5 text-right tabular-nums">{fmt(t.site?.team_page_views ?? 0)}</td>}
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted-foreground sm:table-cell">{fmtDate(lastOf(t))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Utilizadores app = com atividade / com acesso. Os delegados são as contas da equipa no site da Liga.</p>
    </div>
  );
}
