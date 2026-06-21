"use client";

import { BarChart3, Calendar, CreditCard, Users } from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { PaymentsChart } from "@/components/dashboard/payments-chart";
import { PositionsChart } from "@/components/dashboard/positions-chart";
import type {
  AttendanceDataPoint,
  PaymentDataPoint,
  PositionCount,
  Season,
} from "@/types/database";

interface OverviewClientProps {
  activeSeason: Season | null;
  totalPlayers: number;
  totalGames: number;
  pendingPayments: number;
  attendanceData: AttendanceDataPoint[];
  paymentsChartData: PaymentDataPoint[];
  positionsData: PositionCount[];
}

export function OverviewClient({
  activeSeason,
  totalPlayers,
  totalGames,
  pendingPayments,
  attendanceData,
  paymentsChartData,
  positionsData,
}: OverviewClientProps) {
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground">
          {activeSeason
            ? `Temporada ativa: ${activeSeason.name}`
            : "Nenhuma temporada ativa."}
        </p>
      </div>

      {/* Cards de métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Jogadores"
          value={totalPlayers}
          description="Plantel da temporada"
          icon={Users}
          accent="blue"
        />
        <MetricCard
          title="Jogos"
          value={totalGames}
          description="Calendário da temporada"
          icon={Calendar}
          accent="blue"
        />
        <MetricCard
          title="Quotas Pendentes"
          value={pendingPayments}
          description="Pagamentos em atraso"
          icon={CreditCard}
          accent={pendingPayments > 0 ? "red" : "green"}
        />
        <MetricCard
          title="Temporada"
          value={activeSeason?.year ?? "—"}
          description={activeSeason?.status === "ativa" ? "Em curso" : "Sem temporada ativa"}
          icon={BarChart3}
          accent="amber"
        />
      </div>

      {/* Gráficos — linha 1 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceChart data={attendanceData} />
        </div>
        <div>
          <PositionsChart data={positionsData} />
        </div>
      </div>

      {/* Gráficos — linha 2 */}
      <PaymentsChart data={paymentsChartData} />
    </div>
  );
}
