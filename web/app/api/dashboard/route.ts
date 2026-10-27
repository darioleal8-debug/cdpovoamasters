import { todayInClubTz } from "@/lib/time/club-time";
import { pickNextTraining } from "@/lib/time/pick-next-training";
import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/server";
import { getOfficialGameSessionIds } from "@/lib/stats/official-games";

export const runtime = "nodejs";

// ── Helpers ─────────────────────────────────────────────────
function daysUntil(dateStr: string): number {
  const today = new Date(todayInClubTz() + "T00:00:00").getTime();
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
  // Sessão + conta ativa; o perfil já traz o papel ativo
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const sp        = req.nextUrl.searchParams;
  const seasonId  = sp.get("season_id");
  const now       = new Date();
  const today     = todayInClubTz();
  const yesterday = todayInClubTz(new Date(now.getTime() - 86_400_000));
  const ago14     = todayInClubTz(new Date(Date.now() - 14 * 86_400_000));

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
    ourTeamRes,
  ] = await Promise.all([
    // Contagem de jogadores
    supabase.from("players").select("id", { count: "exact", head: true }).eq("season_id", sid),

    // Próximo jogo do CD Póvoa (is_club_game = true)
    supabase.from("events")
      .select("id,title,event_date,event_time,location,competition,opponent")
      .eq("type", "jogo").eq("season_id", sid)
      .eq("is_club_game", true)
      .is("deleted_at", null)
      .gte("event_date", today)
      .order("event_date", { ascending: true }).limit(1).maybeSingle(),

    // Próximo treino — inclui ontem para cobrir janela pós-treino de 3h
    supabase.from("trainings")
      .select("id,date,start_time,end_time,location,type,deleted_at")
      .eq("season_id", sid)
      .is("deleted_at", null)
      .gte("date", yesterday)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(5),

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

    // Nome da equipa do clube na liga (para V/D)
    supabase.from("league_teams").select("name").eq("is_our_team", true).maybeSingle(),
  ]);

  const nextGame      = nextGameRes.data ?? null;
  const nextTraining  = pickNextTraining(nextTrainingRes.data ?? [], now);
  const playerCount   = playersRes.count ?? 0;
  const rosterSize    = rosterSizeRes.count ?? 0;
  const ourTeamName   = ourTeamRes.data?.name ?? null;

  // Vitórias / Derrotas da temporada actual
  let wins = 0, losses = 0;
  if (ourTeamName) {
    const { data: gameResults } = await supabase
      .from("league_game_results")
      .select("home_team_name, away_team_name, home_score, away_score")
      .or(`home_team_name.eq.${ourTeamName},away_team_name.eq.${ourTeamName}`);
    for (const r of gameResults ?? []) {
      const isHome = r.home_team_name === ourTeamName;
      const homeWon = r.home_score > r.away_score;
      if (isHome ? homeWon : !homeWon) wins++; else losses++;
    }
  }

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
      .from("training_attendance")
      .select("player_id, status")
      .eq("training_id", nextTraining.id)
      .in("status", ["present", "late"]);

    type AttRow = { player_id: string; status: string };
    const rows = (attendance ?? []) as AttRow[];
    attendedCount = rows.length;

    // Enriquecer com nome e foto via v_roster
    const attendedIds = rows.slice(0, 5).map((r) => r.player_id);
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

    // Uma só query em vez de uma por treino (PERF-08)
    const recentIds = ((recentTrainings ?? []) as Array<{ id: string }>).map((t) => t.id);
    if (recentIds.length > 0) {
      const { data: marked } = await supabase
        .from("training_attendance")
        .select("training_id")
        .in("training_id", recentIds);
      const withAttendance = new Set(((marked ?? []) as Array<{ training_id: string }>).map((r) => r.training_id));
      missingAttCount = recentIds.filter((id) => !withAttendance.has(id)).length;
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
  const userProfile = auth.profile; // papel ativo (authorize)

  let playerData: {
    games_played: number;
    avg_points: number | null;
    attendance_pct: number | null;
    payment_status: string;
  } | null = null;

  let playerId:            string | null = null;
  let myGameAvailability:  "yes" | "no" | null = null;

  const isPlayer = userProfile?.role === "jogador" ||
    (Array.isArray(userProfile?.roles_extra) && userProfile?.roles_extra.includes("jogador"));

  if (isPlayer) {
    // Encontrar o player_id deste utilizador na temporada corrente
    const { data: playerRow } = await supabase
      .from("players").select("id").eq("user_id", user.id).eq("season_id", sid).maybeSingle();

    if (playerRow) {
      const pid = playerRow.id;
      playerId = pid;

      // Só jogos oficiais contam (exclui treinos/amigáveis, testes e eliminados)
      const officialSessionIds = sid ? await getOfficialGameSessionIds(supabase, sid) : [];
      const [statsRes, attRes, payRes, avRes] = await Promise.all([
        officialSessionIds.length
          ? supabase.from("player_game_stats").select("pts").eq("player_id", pid).in("game_session_id", officialSessionIds)
          : Promise.resolve({ data: [] as Array<{ pts: number }> }),
        supabase.from("training_attendance").select("status").eq("player_id", pid),
        supabase.from("player_payments").select("status").eq("player_id", pid).eq("season_id", sid),
        nextGame?.id
          ? supabase.from("game_availability").select("status")
              .eq("game_id", nextGame.id).eq("player_id", pid).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if ((avRes as { data: { status: string } | null }).data?.status === "available")   myGameAvailability = "yes";
      if ((avRes as { data: { status: string } | null }).data?.status === "unavailable") myGameAvailability = "no";

      const stats = (statsRes.data ?? []) as Array<{ pts: number }>;
      const att   = (attRes.data  ?? []) as Array<{ status: string }>;
      const pays  = (payRes.data  ?? []) as Array<{ status: string }>;

      const gamesPlayed   = stats.length;
      const totalPts      = stats.reduce((s, r) => s + (Number(r.pts) || 0), 0);
      const avgPoints     = gamesPlayed > 0 ? Math.round((totalPts / gamesPlayed) * 10) / 10 : null;
      const attTotal      = att.length;
      const attPct        = attTotal > 0 ? Math.round(att.filter((r) => r.status === "present" || r.status === "late").length / attTotal * 100) : null;
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

  // 5. Jogadores sem primeiro acesso (conta criada mas nunca usada)
  try {
    const admin = await createAdminClient();
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 200 });
    const neverLoggedInSet = new Set(
      authUsers
        .filter((u) => !u.last_sign_in_at && u.email_confirmed_at)
        .map((u) => u.id)
    );
    const { data: seasonPlayers } = await supabase
      .from("players").select("user_id").eq("season_id", sid);
    const neverLoggedInCount = (seasonPlayers ?? []).filter(
      (p) => p.user_id && neverLoggedInSet.has(p.user_id as string)
    ).length;
    if (neverLoggedInCount > 0) {
      tasks.push({
        id: "never-logged-in", severity: "info",
        title: `${neverLoggedInCount} jogador${neverLoggedInCount !== 1 ? "es" : ""} sem primeiro acesso`,
        subtitle: "Conta criada mas nunca utilizada",
        href: "/jogadores", action_label: "Ver plantel",
        deadline: null, count: neverLoggedInCount,
      });
    }
  } catch { /* não crítico — ignora se admin query falhar */ }

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
      wins,
      losses,
      draws:   0,
    },
    tasks:               tasks.slice(0, 5),
    tasks_total:         tasks.length,
    notices:             [],
    playerData,
    isPlayer,
    playerId,
    myGameAvailability,
  });
}
