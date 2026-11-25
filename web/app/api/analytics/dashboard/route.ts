import { NextRequest, NextResponse } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: NextRequest) {
  // Só o Master Admin. Usa o cliente SEM isolamento por clube: a visão é de toda a plataforma.
  // (createAdminClient() filtrava `users` pelo clube do Master e escondia os restantes clubes.)
  const auth = await authorizeMaster();
  if (!auth.ok) return auth.response;
  const admin = auth.admin;

  const sp = req.nextUrl.searchParams;
  const days = Math.min(365, Math.max(7, parseInt(sp.get("days") ?? "30") || 30));

  // Filtro opcional por clube (?club=<uuid>); sem filtro = todos os clubes
  const clubParam = sp.get("club");
  const clubId = clubParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubParam) ? clubParam : null;
  if (clubParam && !clubId) return fail("Clube inválido");

  const { data: clubsList } = await admin.from("clubs").select("id, name, active").order("name");
  if (clubId && !(clubsList ?? []).some((c) => c.id === clubId)) return fail("Clube não encontrado", 404);

  // Utilizadores do âmbito pedido (todos, ou só membros ativos do clube escolhido)
  let scopedUserIds: Set<string> | null = null;
  if (clubId) {
    const { data: members } = await admin.from("club_members").select("user_id").eq("club_id", clubId).eq("active", true);
    scopedUserIds = new Set((members ?? []).map((m) => m.user_id as string));
  }

  // ── 1. Utilizadores + agregados de atividade (calculados na BD) ──
  // A função analytics_usage_summary agrega no Postgres; ler linhas no servidor
  // truncava os resultados nas 1000 linhas por pedido do Supabase.
  const [{ data: allUsers }, { data: summary, error: summaryErr }] = await Promise.all([
    admin.from("users").select("id, name, email, role, active"),
    clubId
      ? admin.rpc("analytics_usage_summary_club", { p_days: days, p_club_id: clubId })
      : admin.rpc("analytics_usage_summary", { p_days: days }),
  ]);
  if (summaryErr) return fail(summaryErr.message, 500);
  const users = scopedUserIds ? (allUsers ?? []).filter((u) => scopedUserIds!.has(u.id as string)) : (allUsers ?? []);

  // Clubes de cada utilizador (para mostrar na tabela quando se vêem todos os clubes)
  const { data: memberRows } = await admin.from("club_members").select("user_id, club_id").eq("active", true);
  const clubName = new Map((clubsList ?? []).map((c) => [c.id as string, c.name as string]));
  const userClubs = new Map<string, string[]>();
  for (const r of memberRows ?? []) {
    const n = clubName.get(r.club_id as string);
    if (n) userClubs.set(r.user_id as string, [...(userClubs.get(r.user_id as string) ?? []), n]);
  }

  type Summary = {
    total_events: number;
    active_today: number;
    active_week: number;
    active_month: number;
    daily: Array<{ date: string; count: number }>;
    dow: number[];
    monthly: Array<{ ym: string; count: number }>;
    pages: Array<{ page: string; count: number }>;
    users: Array<{ user_id: string; events: number; last_seen: string }>;
  };
  const sum = summary as Summary;

  // ── 2. Últimos logins via Auth Admin API (com paginação) ──────
  const authUsers: Array<{ id: string; last_sign_in_at: string | null }> = [];
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

  // ── 3. Formatar agregados ─────────────────────────────────────
  const dailyChart = sum.daily;

  // Dia da semana (0=Dom, 1=Seg … 6=Sáb)
  const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dowChart = DOW_LABELS.map((label, i) => ({ label, count: sum.dow[i] ?? 0 }));

  // Mensal (últimos 12 meses)
  const PT_MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const monthlyChart = sum.monthly.map(({ ym, count }) => ({
    label: PT_MONTHS[parseInt(ym.slice(5, 7)) - 1] + " " + ym.slice(2, 4),
    count,
  }));

  const pageRanking = sum.pages;

  const userEventMap = new Map(sum.users.map((u) => [u.user_id, u.events]));
  const userLastSeen = new Map(sum.users.map((u) => [u.user_id, u.last_seen]));

  const usersList = users.map((u) => {
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
      clubs:         userClubs.get(uid) ?? [],
      events_period: userEventMap.get(uid) ?? 0,
      last_seen:     lastSeenFallback,
      last_login:    lastLogin,
    };
  }).sort((a, b) => b.events_period - a.events_period);

  return NextResponse.json({
    period_days: days,
    club_id:     clubId,
    clubs:       (clubsList ?? []).map((c) => ({ id: c.id as string, name: c.name as string, active: c.active as boolean })),
    overview: {
      total_users:   users.length,
      active_users:  users.filter((u) => u.active).length,
      active_today:  sum.active_today,
      active_week:   sum.active_week,
      active_month: sum.active_month,
      total_events:  sum.total_events,
    },
    daily_chart:   dailyChart,
    dow_chart:     dowChart,
    monthly_chart: monthlyChart,
    page_ranking:  pageRanking,
    users:         usersList,
  });
}
