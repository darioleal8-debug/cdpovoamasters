import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Não autenticado", 401);

  // Verificar que é admin
  const { data: profile } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "treinador", "tesoureiro"].includes(profile.role)) {
    return fail("Sem permissão", 403);
  }

  const sp = req.nextUrl.searchParams;
  const days = Math.min(365, Math.max(7, parseInt(sp.get("days") ?? "30") || 30));

  const admin = await createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const startOfToday  = today + "T00:00:00.000Z";
  const startOfWeek   = new Date(Date.now() - 7  * 86_400_000).toISOString();
  const startOfMonth  = new Date(Date.now() - 30 * 86_400_000).toISOString();

  // ── 1. Todos os utilizadores (nome, role, last_sign_in) ──────
  const [
    { data: users },
    { data: activityRaw },
    { data: pageCounts },
    { data: dowCounts },
    { data: monthlyCounts },
  ] = await Promise.all([
    admin.from("users").select("id, name, email, role, active"),

    // Actividade no período (para ranking + last_seen + daily chart)
    admin
      .from("user_activity_logs")
      .select("user_id, page, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true }),

    // Top páginas no período
    admin
      .from("user_activity_logs")
      .select("page")
      .gte("created_at", since)
      .not("page", "is", null),

    // Actividade por dia da semana (0=Dom … 6=Sáb) — últimos 90d max
    admin
      .from("user_activity_logs")
      .select("created_at")
      .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString()),

    // Actividade mensal — últimos 12 meses
    admin
      .from("user_activity_logs")
      .select("created_at")
      .gte("created_at", new Date(Date.now() - 365 * 86_400_000).toISOString()),
  ]);

  // ── 2. Últimos logins via Auth Admin API (com paginação) ──────
  let authUsers: Array<{ id: string; last_sign_in_at: string | null }> = [];
  try {
    let page = 1;
    while (true) {
      const { data } = await admin.auth.admin.listUsers({ perPage: 200, page });
      const batch = data?.users ?? [];
      authUsers.push(...batch.map((u) => ({
        id: u.id,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })));
      if (batch.length < 200) break;
      page++;
      if (page > 25) break; // safety cap
    }
  } catch {
    // non-critical
  }
  const lastLoginMap = new Map(authUsers.map((u) => [u.id, u.last_sign_in_at]));

  // ── 3. Agregar actividade ─────────────────────────────────────
  const logs = activityRaw ?? [];

  // Active counts
  const activeToday = new Set(logs.filter((l) => l.created_at >= startOfToday).map((l) => l.user_id)).size;
  const activeWeek  = new Set(logs.filter((l) => l.created_at >= startOfWeek).map((l) => l.user_id)).size;
  const activeMonth = new Set(logs.filter((l) => l.created_at >= startOfMonth).map((l) => l.user_id)).size;

  // Daily chart: events per day
  const dailyMap = new Map<string, number>();
  for (let d = 0; d < days; d++) {
    const dt = new Date(Date.now() - (days - 1 - d) * 86_400_000).toISOString().slice(0, 10);
    dailyMap.set(dt, 0);
  }
  for (const l of logs) {
    const dt = l.created_at.slice(0, 10);
    if (dailyMap.has(dt)) dailyMap.set(dt, (dailyMap.get(dt) ?? 0) + 1);
  }
  const dailyChart = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

  // Day of week (0=Dom, 1=Seg … 6=Sáb)
  const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dowMap = new Array(7).fill(0);
  for (const l of (dowCounts ?? [])) {
    const dow = new Date(l.created_at).getDay();
    dowMap[dow]++;
  }
  const dowChart = DOW_LABELS.map((label, i) => ({ label, count: dowMap[i] }));

  // Monthly (last 12 months)
  const monthMap = new Map<string, number>();
  for (let m = 11; m >= 0; m--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - m);
    monthMap.set(d.toISOString().slice(0, 7), 0);
  }
  for (const l of (monthlyCounts ?? [])) {
    const ym = l.created_at.slice(0, 7);
    if (monthMap.has(ym)) monthMap.set(ym, (monthMap.get(ym) ?? 0) + 1);
  }
  const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const monthlyChart = Array.from(monthMap.entries()).map(([ym, count]) => ({
    label: PT_MONTHS[parseInt(ym.slice(5, 7)) - 1] + " " + ym.slice(2, 4),
    count,
  }));

  // Page ranking
  const pageMap = new Map<string, number>();
  for (const l of (pageCounts ?? [])) {
    if (!l.page) continue;
    pageMap.set(l.page, (pageMap.get(l.page) ?? 0) + 1);
  }
  const pageRanking = Array.from(pageMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([page, count]) => ({ page, count }));

  // User ranking
  const userEventMap   = new Map<string, number>();
  const userLastSeen   = new Map<string, string>();
  for (const l of logs) {
    userEventMap.set(l.user_id, (userEventMap.get(l.user_id) ?? 0) + 1);
    const cur = userLastSeen.get(l.user_id);
    if (!cur || l.created_at > cur) userLastSeen.set(l.user_id, l.created_at);
  }

  const usersList = (users ?? []).map((u) => {
    const uid        = u.id as string;
    const lastSeen   = userLastSeen.get(uid) ?? null;
    const lastLogin  = lastLoginMap.get(uid) ?? null;
    // Se não há actividade tracked mas há login recente, usa o login como "último acesso"
    const lastSeenFallback = lastSeen ?? lastLogin;
    return {
      id:            uid,
      name:          u.name as string,
      email:         u.email as string,
      role:          u.role as string,
      active:        u.active as boolean,
      events_period: userEventMap.get(uid) ?? 0,
      last_seen:     lastSeenFallback,
      last_login:    lastLogin,
    };
  }).sort((a, b) => b.events_period - a.events_period);

  return NextResponse.json({
    period_days: days,
    overview: {
      total_users:   (users ?? []).length,
      active_users:  (users ?? []).filter((u) => u.active).length,
      active_today:  activeToday,
      active_week:   activeWeek,
      active_month:  activeMonth,
      total_events:  logs.length,
    },
    daily_chart:   dailyChart,
    dow_chart:     dowChart,
    monthly_chart: monthlyChart,
    page_ranking:  pageRanking,
    users:         usersList,
  });
}
