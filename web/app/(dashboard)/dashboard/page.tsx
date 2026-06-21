import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { OverviewClient } from "../overview-client";

export const metadata: Metadata = { title: "Visão Geral" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* Temporada ativa */
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("*")
    .eq("status", "ativa")
    .single();

  const seasonId = activeSeason?.id ?? null;

  /* Queries paralelas para métricas */
  const [playersRes, gamesRes, pendingRes, eventsForChartRes, paymentsForChartRes] =
    await Promise.all([
      seasonId
        ? supabase.from("player_profiles").select("id", { count: "exact", head: true }).eq("season_id", seasonId)
        : { count: 0, error: null },
      seasonId
        ? supabase.from("events").select("id", { count: "exact", head: true }).eq("season_id", seasonId).eq("type", "jogo")
        : { count: 0, error: null },
      seasonId
        ? supabase.from("payments").select("id", { count: "exact", head: true }).eq("season_id", seasonId).eq("status", "pendente")
        : { count: 0, error: null },
      seasonId
        ? supabase.from("events").select("type, event_date").eq("season_id", seasonId)
        : { data: [], error: null },
      seasonId
        ? supabase.from("payments").select("month, reference_year, amount, status").eq("season_id", seasonId)
        : { data: [], error: null },
    ]);

  /* Construir dados para gráfico de presença */
  const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const attendanceMap = new Map<string, { jogos: number; treinos: number }>();
  for (const ev of (eventsForChartRes.data ?? []) as Array<{ type: string; event_date: string }>) {
    const month = MONTH_ABBR[new Date(ev.event_date).getMonth()];
    const entry = attendanceMap.get(month) ?? { jogos: 0, treinos: 0 };
    if (ev.type === "jogo") entry.jogos++;
    else if (ev.type === "treino") entry.treinos++;
    attendanceMap.set(month, entry);
  }
  const attendanceData = Array.from(attendanceMap.entries()).map(([month, v]) => ({ month, ...v }));

  /* Dados para gráfico de pagamentos */
  const paymentMap = new Map<string, { pago: number; pendente: number }>();
  for (const p of (paymentsForChartRes.data ?? []) as Array<{ month: number; reference_year: number; amount: number; status: string }>) {
    const key = `${MONTH_ABBR[p.month - 1]}/${String(p.reference_year).slice(2)}`;
    const entry = paymentMap.get(key) ?? { pago: 0, pendente: 0 };
    if (p.status === "pago") entry.pago += Number(p.amount);
    else entry.pendente += Number(p.amount);
    paymentMap.set(key, entry);
  }
  const paymentsChartData = Array.from(paymentMap.entries())
    .slice(-6)
    .map(([month, v]) => ({ month, ...v }));

  /* Dados posições */
  const { data: positionsRaw } = seasonId
    ? await supabase.from("player_profiles").select("position").eq("season_id", seasonId).not("position", "is", null)
    : { data: [] };

  const posMap: Record<string, number> = {};
  for (const r of (positionsRaw ?? []) as Array<{ position: string | null }>) {
    if (r.position) posMap[r.position] = (posMap[r.position] ?? 0) + 1;
  }
  const LABELS: Record<string, string> = { base: "Base", extremo: "Extremo", poste: "Poste" };
  const positionsData = Object.entries(posMap).map(([name, value]) => ({
    name: LABELS[name] ?? name,
    value,
    fill: "",
  }));

  return (
    <OverviewClient
      activeSeason={activeSeason ?? null}
      totalPlayers={playersRes.count ?? 0}
      totalGames={gamesRes.count ?? 0}
      pendingPayments={pendingRes.count ?? 0}
      attendanceData={attendanceData}
      paymentsChartData={paymentsChartData}
      positionsData={positionsData}
    />
  );
}
