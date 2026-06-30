"use client";

import Link from "next/link";
import Image from "next/image";
import {
  BarChart3, Calendar, CalendarRange, CreditCard,
  Dumbbell, Users, ArrowRight, Trophy,
} from "lucide-react";
import { MetricCard }     from "@/components/dashboard/metric-card";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { PaymentsChart }   from "@/components/dashboard/payments-chart";
import { PositionsChart }  from "@/components/dashboard/positions-chart";
import { useClubSettings } from "@/lib/club-context";
import type {
  AttendanceDataPoint,
  PaymentDataPoint,
  PositionCount,
  Season,
} from "@/types/database";

// ─── Types ───────────────────────────────────────────────

interface OverviewClientProps {
  activeSeason:     Season | null;
  totalPlayers:     number;
  totalGames:       number;
  pendingPayments:  number;
  attendanceData:   AttendanceDataPoint[];
  paymentsChartData: PaymentDataPoint[];
  positionsData:    PositionCount[];
}

// ─── Quick Nav Cards ─────────────────────────────────────

const QUICK_NAV = [
  { href: "/jogadores",  label: "Jogadores",   icon: Users,         desc: "Plantel e perfis" },
  { href: "/jogos",      label: "Jogos",        icon: Calendar,      desc: "Calendário da liga" },
  { href: "/treinos",    label: "Treinos",      icon: Dumbbell,      desc: "Sessões e presenças" },
  { href: "/pagamentos", label: "Pagamentos",   icon: CreditCard,    desc: "Quotas e histórico" },
  { href: "/temporadas", label: "Temporadas",   icon: CalendarRange, desc: "Gestão de temporadas" },
  { href: "/estatisticas",label: "Estatísticas",icon: BarChart3,     desc: "Análise e gráficos" },
];

// ─── Club Hero ────────────────────────────────────────────

function ClubHero({ season }: { season: Season | null }) {
  const { settings, theme } = useClubSettings();

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-6 py-8 text-white shadow-lg"
      style={{ backgroundColor: "var(--club-primary, #111111)" }}
    >
      {/* Decoração de fundo */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-10"
        style={{ backgroundColor: "var(--club-secondary, #F28C28)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-8 right-24 h-32 w-32 rounded-full opacity-10"
        style={{ backgroundColor: "var(--club-accent, #ffffff)" }}
      />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        {/* Logo / iniciais */}
        <div className="shrink-0">
          {settings.logo_url ? (
            <div
              className="relative h-20 w-20 overflow-hidden rounded-2xl shadow-lg ring-4 ring-white/20"
            >
              <Image
                src={settings.logo_url}
                alt={settings.club_name}
                fill
                sizes="80px"
                className="object-contain p-1"
                style={{ backgroundColor: "var(--club-bg, #eeeeee)" }}
              />
            </div>
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-xl font-black shadow-lg ring-4 ring-white/20"
              style={{ backgroundColor: "var(--club-secondary, #F28C28)", color: "var(--club-secondary-fg, #ffffff)" }}
            >
              {settings.club_name
                .split(" ")
                .filter((w) => /^[A-ZÁÉÍÓÚÃÕ]/i.test(w))
                .slice(0, 3)
                .map((w) => w[0].toUpperCase())
                .join("")}
            </div>
          )}
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-black tracking-tight truncate" style={{ color: "var(--club-primary-fg, #ffffff)" }}>
              {settings.club_name}
            </h1>
            {season && (
              <span
                className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
                style={{
                  backgroundColor: "var(--club-secondary, #F28C28)",
                  color: "var(--club-secondary-fg, #ffffff)",
                }}
              >
                <Trophy className="inline h-2.5 w-2.5 mr-1" />
                {season.name}
              </span>
            )}
          </div>
          <p className="text-sm opacity-75" style={{ color: "var(--club-primary-fg, #ffffff)" }}>
            {season ? `Temporada ${season.year} em curso` : "Nenhuma temporada ativa"}
          </p>
        </div>

        {/* Kit swatch — indica as cores activas */}
        <div className="shrink-0 hidden sm:flex flex-col items-center gap-1 opacity-60">
          <div className="flex gap-1.5">
            <span
              title="Cor primária (camisola casa)"
              className="h-5 w-5 rounded-full border-2 border-white/30 shadow"
              style={{ backgroundColor: theme.primary }}
            />
            <span
              title="Cor secundária (calção casa)"
              className="h-5 w-5 rounded-full border-2 border-white/30 shadow"
              style={{ backgroundColor: theme.secondary }}
            />
            <span
              title="Cor de acento (camisola fora)"
              className="h-5 w-5 rounded-full border-2 border-white/30 shadow"
              style={{ backgroundColor: theme.accent }}
            />
          </div>
          <span className="text-[9px] uppercase tracking-widest opacity-50" style={{ color: "var(--club-primary-fg, #ffffff)" }}>
            Equipamento
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Nav Grid ───────────────────────────────────────

function QuickNavGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {QUICK_NAV.map(({ href, label, icon: Icon, desc }) => (
        <Link
          key={href}
          href={href}
          className="group flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-all hover:shadow-md"
          style={{
            borderColor: "var(--club-primary, #111111)20",
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors group-hover:opacity-90"
            style={{
              backgroundColor: "var(--club-bg, #eeeeee)",
              color: "var(--club-primary, #111111)",
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{label}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 hidden sm:block">{desc}</p>
          </div>
          <ArrowRight
            className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </Link>
      ))}
    </div>
  );
}

// ─── Overview principal ───────────────────────────────────

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
      {/* Hero do clube */}
      <ClubHero season={activeSeason} />

      {/* Atalhos rápidos */}
      <QuickNavGrid />

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
