import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";
import { lisbonMonth, rates } from "@/lib/ai-usage";

export const dynamic = "force-dynamic";

type Row = { club_id: string | null; source: string; league_team_id: string | null; month: string; feature: string; cost_eur: number | string; prompt_tokens: number; completion_tokens: number };

function lastMonths(n: number): string[] {
  const [y, m] = lisbonMonth().split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// GET /api/master/ai-usage?months=6 — gasto estimado de IA por clube e por mês (só Master Admin)
export async function GET(req: NextRequest) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;

  const n = Math.min(24, Math.max(1, parseInt(req.nextUrl.searchParams.get("months") ?? "6") || 6));
  const months = lastMonths(n);

  const [clubsRes, usageRes, teamsRes] = await Promise.all([
    m.admin.from("clubs").select("id, name, active, ai_monthly_budget_eur").order("name"),
    m.admin.from("ai_usage").select("club_id, source, league_team_id, month, feature, cost_eur, prompt_tokens, completion_tokens").in("month", months).limit(100000),
    m.admin.from("league_teams").select("id, name"),
  ]);
  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 });
  if (usageRes.error) return NextResponse.json({ error: usageRes.error.message }, { status: 500 });

  const current = months[0];
  type Agg = { monthly: Record<string, { cost: number; calls: number }>; features: Record<string, number> };
  const aggregate = (rows: Row[], keyOf: (r: Row) => string) => {
    const map = new Map<string, Agg>();
    for (const r of rows) {
      const k = keyOf(r);
      const e = map.get(k) ?? { monthly: {}, features: {} };
      map.set(k, e);
      const cell = (e.monthly[r.month] ??= { cost: 0, calls: 0 });
      cell.cost += Number(r.cost_eur);
      cell.calls += 1;
      if (r.month === current) e.features[r.feature] = (e.features[r.feature] ?? 0) + Number(r.cost_eur);
    }
    return map;
  };
  const all = (usageRes.data ?? []) as Row[];
  const appAgg = aggregate(all.filter((r) => r.source !== "liga"), (r) => r.club_id ?? "none");
  const ligaAgg = aggregate(all.filter((r) => r.source === "liga"), (r) => r.club_id ?? (r.league_team_id ? `team:${r.league_team_id}` : "none"));

  const mk = (agg: Map<string, Agg>, id: string, name: string, active: boolean, limit: number | null) => {
    const e = agg.get(id) ?? { monthly: {}, features: {} };
    return { id, name, active, limit_eur: limit, monthly: e.monthly, features: e.features };
  };
  const clubs = (clubsRes.data ?? []).map((c) => mk(appAgg, c.id, c.name, c.active, Number(c.ai_monthly_budget_eur)));
  const noClub = mk(appAgg, "none", "Sem clube (Liga / tarefas automáticas)", true, null);
  const hasNoClub = Object.keys(noClub.monthly).length > 0;

  // Liga INATEL: por clube associado à equipa; equipas sem clube e conciliações ficam em linhas próprias
  const teamName = new Map((teamsRes.data ?? []).map((t) => [t.id as string, t.name as string]));
  const liga = (clubsRes.data ?? []).map((c) => mk(ligaAgg, c.id, c.name, c.active, null)).filter((c) => Object.keys(c.monthly).length > 0);
  for (const key of ligaAgg.keys()) {
    if (key === "none") liga.push(mk(ligaAgg, key, "Liga — conciliação de jogos (sem equipa)", true, null));
    else if (key.startsWith("team:")) liga.push(mk(ligaAgg, key, teamName.get(key.slice(5)) ?? "Equipa da Liga", true, null));
  }

  const r = rates();
  return NextResponse.json({
    months,
    current_month: current,
    clubs: hasNoClub ? [...clubs, noClub] : clubs,
    liga,
    rates: { input_usd: r.input, cached_usd: r.cached, output_usd: r.output, usd_to_eur: r.usdToEur },
  });
}
