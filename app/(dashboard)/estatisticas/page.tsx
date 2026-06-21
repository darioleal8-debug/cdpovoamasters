"use client";

import { useState, useMemo } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { usePlayers } from "@/hooks/use-players";
import { useGames } from "@/hooks/use-games";
import { usePayments } from "@/hooks/use-payments";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { PaymentsChart } from "@/components/dashboard/payments-chart";
import { PositionsChart } from "@/components/dashboard/positions-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, Calendar, CreditCard, Users } from "lucide-react";
import type { AttendanceDataPoint, PaymentDataPoint, PositionCount } from "@/types/database";

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const LABELS: Record<string, string> = { base: "Base", extremo: "Extremo", poste: "Poste" };

export default function EstatisticasPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { players, loading: playersLoading } = usePlayers(seasonId);
  const { events, loading: eventsLoading } = useGames(seasonId);
  const { payments, totalPago, totalPendente, loading: paymentsLoading } = usePayments(seasonId);

  const isLoading = playersLoading || eventsLoading || paymentsLoading;

  /* Dados para gráfico de calendário */
  const attendanceData = useMemo<AttendanceDataPoint[]>(() => {
    const map = new Map<string, { jogos: number; treinos: number }>();
    for (const ev of events) {
      const m = MONTH_ABBR[new Date(ev.event_date).getMonth()];
      const e = map.get(m) ?? { jogos: 0, treinos: 0 };
      if (ev.type === "jogo") e.jogos++; else if (ev.type === "treino") e.treinos++;
      map.set(m, e);
    }
    return Array.from(map.entries()).map(([month, v]) => ({ month, ...v }));
  }, [events]);

  /* Dados para gráfico de pagamentos */
  const paymentsChartData = useMemo<PaymentDataPoint[]>(() => {
    const map = new Map<string, { pago: number; pendente: number }>();
    for (const p of payments) {
      const key = `${MONTH_ABBR[p.month - 1]}/${String(p.reference_year).slice(2)}`;
      const e = map.get(key) ?? { pago: 0, pendente: 0 };
      if (p.status === "pago") e.pago += Number(p.amount); else e.pendente += Number(p.amount);
      map.set(key, e);
    }
    return Array.from(map.entries()).slice(-6).map(([month, v]) => ({ month, ...v }));
  }, [payments]);

  /* Dados para gráfico de posições */
  const positionsData = useMemo<PositionCount[]>(() => {
    const map: Record<string, number> = {};
    for (const p of players) if (p.position) map[p.position] = (map[p.position] ?? 0) + 1;
    return Object.entries(map).map(([name, value]) => ({ name: LABELS[name] ?? name, value, fill: "" }));
  }, [players]);

  const totalGames = events.filter((e) => e.type === "jogo").length;
  const totalTrainings = events.filter((e) => e.type === "treino").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estatísticas</h1>
          <p className="text-muted-foreground">Análise detalhada da temporada</p>
        </div>
        <Select value={seasonId ?? ""} onValueChange={setSelectedSeasonId} disabled={seasonsLoading}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Selecionar temporada" /></SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name} {s.status === "ativa" ? "✓" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Jogadores"       value={players.length} description="No plantel"            icon={Users}    accent="blue"  loading={isLoading} />
        <MetricCard title="Jogos"           value={totalGames}     description="Calendário"             icon={Calendar} accent="blue"  loading={isLoading} />
        <MetricCard title="Treinos"         value={totalTrainings} description="Sessões marcadas"       icon={BarChart3} accent="amber" loading={isLoading} />
        <MetricCard title="Receita Total"   value={formatCurrency(totalPago + totalPendente)} description={`Pendente: ${formatCurrency(totalPendente)}`} icon={CreditCard} accent={totalPendente > 0 ? "red" : "green"} loading={isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceChart data={attendanceData} loading={isLoading} />
        </div>
        <PositionsChart data={positionsData} loading={isLoading} />
      </div>

      <PaymentsChart data={paymentsChartData} loading={isLoading} />
    </div>
  );
}
