import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ── Helpers ─────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((new Date(dateStr + "T00:00:00").getTime() - today) / 86_400_000);
}

function truncateNames(names: string[], total: number): string {
  if (total === 0) return "";
  const first = names.slice(0, 2).map((n) => {
    const parts = n.trim().split(" ");
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  });
  const rest = total - first.length;
  return rest > 0 ? `${first.join(", ")} e mais ${rest}` : first.join(", ");
}

// ── GET /api/dashboard?season_id=… ──────────────────────────
export async function GET(req: NextRequest) {
  const supabase   = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp        = req.nextUrl.searchParams;
  const seasonId  = sp.get("season_id");
  const today     = new Date().toISOString().slice(0, 10);
  const ago14     = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  // Temporada de contexto (ou activa)
  const seasonRes = seasonId
    ? await supabase.from("seasons").select("id,name,year,start_date,end_date,status").eq("id", seasonId).single()
    : await supabase.from("seasons").select("id,name,year,start_date,end_date,status").eq("status", "ativa").maybeSingle();

  const season = seasonRes.data ?? null;
  const sid    = season?.id ?? seasonId ?? null;

  if (!sid) {
    return NextResponse.json({
      season: null, nextGame: null, nextTraining: null,
      metrics: { players: 0, wins: 0, losses: 0, draws: 0 },
      tasks: [], tasks_total: 0, notices: [], playerData: null, isPlayer: false,
    });
  }

  // ── Queries paralelas ────────────────────────────────────
  const [
    playersRes, nextGameRes, nextTrainingRes,
    latePayRes, incompleteRes, rosterSizeRes,
  ] = await Promise.all([
    // Contagem de jogadores
    supabase.from("players").select("id", { count: "exact", head: true }).eq("season_id", sid),

    // Próximo jogo
    supabase.from("events")
      .select("id,title,event_date,event_time,location,competition,opponent")
      .eq("type", "jogo").eq("season_id", sid)
      .gte("event_date", today)
      .order("event_date", { ascending: true }).limit(1).maybeSingle(),

    // Próximo treino — tabela separada "trainings" (date, start_time, type)
    supabase.from("trainings")
      .select("id,date,start_time,location,type")
      .eq("season_id", sid)
      .gte("date", today)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1).maybeSingle(),

    // Quotas em atraso — player_payments com status late/partial
    // players.name foi removido na migration 041; nome enriquecido abaixo via v_roster
    supabase.from("player_payments")
      .select("player_id, status, amount, amount_due")
      .eq("season_id", sid)
      .in("status", ["late", "partial"]),

    // Jogadores com perfil incompleto (sem posição ou nº camisola)
    supabase.from("players")
      .select("id", { count: "exact", head: true })
      .eq("season_id", sid)
      .or("position.is.null,number.is.null"),

    // Tamanho do plantel (para callup)
    supabase.from("players").select("id", { count: "exact", head: true }).eq("season_id", sid),
  ]);

  const nextGame     = nextGameRes.data ?? null;
  const nextTraining = nextTrainingRes.data ?? null;
  const playerCount  = playersRes.count ?? 0;
  const rosterSize   = rosterSizeRes.count ?? 0;

  // Contagem de convocados para o próximo jogo
  let callupCount = 0;
  let topAvatars:  Array<{ id: string; name: string; photo_url: string | null }> = [];
  let attendedCount = 0;

  if (nextGame) {
    const { data: callups } = await supabase
      .from("game_callups")
      .select("id")
      .eq("game_id", nextGame.id);
    callupCount = (callups ?? []).length;
  }

  if (nextTraining) {
    const { data: attendance } = await supabase
      .from("training_attendances")
      .select("player_id, attended")
      .eq("training_id", nextTraining.id);

    type AttRow = { player_id: string; attended: boolean };
    const rows = (attendance ?? []) as unknown as AttRow[];
    attendedCount = rows.filter((r) => r.attended).length;

    // Enriquecer com nome e foto via v_roster
    const attendedIds = rows.filter((r) => r.attended).slice(0, 5).map((r) => r.player_id);
    if (attendedIds.length > 0) {
      const { data: attRoster } = await supabase
        .from("v_roster")
        .select("player_id, name, photo_url")
        .in("player_id", attendedIds);
      const byId = new Map((attRoster ?? []).map((r) => [r.player_id as string, r]));
      topAvatars = attendedIds
        .map((pid) => byId.get(pid))
        .filter(Boolean)
        .map((r) => ({ id: r!.player_id as string, name: r!.name as string, photo_url: r!.photo_url as string | null }));
    }
  }

  // Treinos recentes sem presenças
  let missingAttCount = 0;
  {
    const { data: recentTrainings } = await supabase
      .from("trainings")
      .select("id")
      .eq("season_id", sid)
      .gte("date", ago14).lt("date", today);

    for (const t of (recentTrainings ?? []) as Array<{ id: string }>) {
      const { count } = await supabase
        .from("training_attendances")
        .select("id", { count: "exact", head: true })
        .eq("training_id", t.id);
      if ((count ?? 0) === 0) missingAttCount++;
    }
  }

  // ── Tarefas derivadas ────────────────────────────────────
  type Task = {
    id: string; severity: "bad" | "warn" | "info";
    title: string; subtitle: string;
    href: string; action_label: string;
    deadline: string | null; count: number;
  };
  const tasks: Task[] = [];

  // 1. Quotas em atraso — enriquecer com nome via v_roster
  type LateRow = { player_id: string; status: string; amount: number; amount_due: number };
  const lateRows = ((latePayRes.data ?? []) as unknown as LateRow[]);
  const latePlayerIds = [...new Set(lateRows.map((r) => r.player_id))];
  const lateTotal     = lateRows.reduce((s, r) => s + (Number(r.amount_due) - Number(r.amount)), 0);

  // Obter nomes dos jogadores com atrasos
  let lateNames: Record<string, string> = {};
  if (latePlayerIds.length > 0) {
    const { data: lateRoster } = await supabase
      .from("v_roster").select("player_id, name").in("player_id", latePlayerIds);
    lateNames = Object.fromEntries((lateRoster ?? []).map((r) => [r.player_id as string, r.name as string]));
  }

  if (latePlayerIds.length > 0) {
    const names = latePlayerIds.map((pid) => lateNames[pid] ?? "?");
    tasks.push({
      id: "late-payments", severity: "bad",
      title: `${latePlayerIds.length} jogador${latePlayerIds.length !== 1 ? "es" : ""} com quotas em falta`,
      subtitle: `${truncateNames(names, latePlayerIds.length)} — ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(lateTotal)} por cobrar`,
      href: "/pagamentos", action_label: "Ver pagamentos",
      deadline: null, count: latePlayerIds.length,
    });
  }

  // 2. Convocatória em aberto
  if (nextGame && rosterSize > 0 && callupCount < rosterSize) {
    const days    = daysUntil(nextGame.event_date);
    const missing = rosterSize - callupCount;
    tasks.push({
      id: "callup-open", severity: days <= 7 ? "warn" : "info",
      title: `Convocatória por fechar`,
      subtitle: `Jogo em ${days <= 0 ? "hoje" : `${days} dia${days !== 1 ? "s" : ""}`} — ${callupCount} de ${rosterSize} convocados`,
      href: `/jogos/${nextGame.id}/stats`, action_label: "Ver jogo",
      deadline: nextGame.event_date, count: missing,
    });
  }

  // 3. Treinos sem presenças
  if (missingAttCount > 0) {
    tasks.push({
      id: "missing-attendance", severity: "info",
      title: `${missingAttCount} treino${missingAttCount !== 1 ? "s" : ""} sem presenças`,
      subtitle: "Últimos 14 dias",
      href: "/treinos", action_label: "Registar presenças",
      deadline: null, count: missingAttCount,
    });
  }

  // 4. Perfis incompletos
  const incompleteCount = incompleteRes.count ?? 0;
  if (incompleteCount > 0) {
    tasks.push({
      id: "incomplete-players", severity: "info",
      title: `${incompleteCount} ficha${incompleteCount !== 1 ? "s" : ""} incompleta${incompleteCount !== 1 ? "s" : ""}`,
      subtitle: "Posição ou nº de camisola em falta",
      href: "/jogadores", action_label: "Completar perfis",
      deadline: null, count: incompleteCount,
    });
  }

  // Ordenar: bad → warn → info; dentro de cada grupo por count desc
  const severityOrder = { bad: 0, warn: 1, info: 2 };
  tasks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.count - a.count);

  // Dados do jogador (para utilizadores com roles_extra: ["player"])
  const { data: userProfile } = await supabase
    .from("users").select("role, roles_extra").eq("id", user.id).single();

  let playerData: {
    games_played: number;
    avg_points: number | null;
    attendance_pct: number | null;
    payment_status: string;
  } | null = null;

  const isPlayer = userProfile?.role === "jogador" ||
    (Array.isArray(userProfile?.roles_extra) && userProfile?.roles_extra.includes("player"));

  if (isPlayer) {
    // Encontrar o player_id deste utilizador na temporada corrente
    const { data: playerRow } = await supabase
      .from("players").select("id").eq("user_id", user.id).eq("season_id", sid).maybeSingle();

    if (playerRow) {
      const pid = playerRow.id;
      const [statsRes, attRes, payRes] = await Promise.all([
        supabase.from("player_game_stats").select("points").eq("player_id", pid),
        supabase.from("training_attendances").select("attended").eq("player_id", pid),
        supabase.from("player_payments").select("status").eq("player_id", pid).eq("season_id", sid),
      ]);

      const stats = (statsRes.data ?? []) as Array<{ points: number }>;
      const att   = (attRes.data  ?? []) as Array<{ attended: boolean }>;
      const pays  = (payRes.data  ?? []) as Array<{ status: string }>;

      const gamesPlayed   = stats.length;
      const totalPts      = stats.reduce((s, r) => s + (Number(r.points) || 0), 0);
      const avgPoints     = gamesPlayed > 0 ? Math.round((totalPts / gamesPlayed) * 10) / 10 : null;
      const attTotal      = att.length;
      const attPct        = attTotal > 0 ? Math.round(att.filter((r) => r.attended).length / attTotal * 100) : null;
      const hasLate       = pays.some((p) => p.status === "late" || p.status === "partial");
      const allPaid       = pays.length > 0 && pays.every((p) => p.status === "paid" || p.status === "exempt");

      playerData = {
        games_played: gamesPlayed,
        avg_points: avgPoints,
        attendance_pct: attPct,
        payment_status: hasLate ? "late" : allPaid ? "paid" : pays.length === 0 ? "unknown" : "partial",
      };
    }
  }

  // ── Resposta ─────────────────────────────────────────────
  return NextResponse.json({
    season,
    nextGame: nextGame
      ? {
          id:           nextGame.id,
          title:        nextGame.title,
          opponent:     nextGame.opponent,
          event_date:   nextGame.event_date,
          event_time:   nextGame.event_time,
          location:     nextGame.location,
          competition:  nextGame.competition,
          days_until:   daysUntil(nextGame.event_date),
          callup_count: callupCount,
          roster_size:  rosterSize,
        }
      : null,
    nextTraining: nextTraining
      ? {
          id:             nextTraining.id,
          event_date:     nextTraining.date,
          event_time:     nextTraining.start_time,
          location:       nextTraining.location,
          training_kind:  nextTraining.type,
          attended_count: attendedCount,
          roster_size:    rosterSize,
          top_avatars:    topAvatars,
        }
      : null,
    metrics: {
      players: playerCount,
      wins:    0,
      losses:  0,
      draws:   0,
    },
    tasks:       tasks.slice(0, 5),
    tasks_total: tasks.length,
    notices:     [],
    playerData,
    isPlayer,
  });
}
