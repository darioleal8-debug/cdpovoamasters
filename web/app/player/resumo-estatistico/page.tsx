import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/auth/guards";
import { clubIdForUser, activeSeasonForClub } from "@/lib/auth/club";
import { getOfficialGameSessionIds } from "@/lib/stats/official-games";
import { aggregateAverages, type GameStatRow, type PlayerAverages } from "@/lib/stats/team-averages";
import { ResumoEstatisticoClient, type ResumoPlayerAverages, type TrainingRow } from "./resumo-estatistico-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumo Estatístico" };

type SeasonRow = { id: string; name: string; start_date: string | null; status: string };
type PgsRow = Omit<GameStatRow, "key"> & { player_id: string };

export default async function ResumoEstatisticoPage() {
  const authz = await authorize();
  if (!authz.ok) redirect(authz.response.status === 401 ? "/login" : "/login?reason=inactive");
  const { user, supabase } = authz;

  const admin = await createAdminClient();
  const clubId = await clubIdForUser(supabase, user.id);

  // Épocas do clube (a ativa, ou a mais recente como fallback)
  const { data: seasonsRaw } = await admin
    .from("seasons")
    .select("id, name, start_date, status")
    .order("start_date", { ascending: false });
  const seasons = (seasonsRaw ?? []) as SeasonRow[];

  const active = await activeSeasonForClub<{ id: string; name: string }>(supabase, clubId, "id,name");
  const current = seasons.find((s) => s.id === active?.id) ?? seasons[0] ?? null;

  if (!current) {
    return (
      <div className="py-20 text-center text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>
        Nenhuma temporada disponível.
      </div>
    );
  }

  // Jogadores de todas as épocas: nome/número por jogador + ligação à conta (users) para somar épocas
  const { data: playersRaw } = await admin
    .from("players")
    .select("id, number, position, user_id, season_id")
    .in("season_id", seasons.map((s) => s.id));
  const players = (playersRaw ?? []) as { id: string; number: number | null; position: string | null; user_id: string | null; season_id: string }[];

  const userIds = [...new Set(players.map((p) => p.user_id).filter((id): id is string => !!id))];
  const nameByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await admin.from("users").select("id, name").in("id", userIds);
    (users ?? []).forEach((u) => nameByUser.set(u.id as string, (u.name as string) ?? ""));
  }
  const playerById = new Map(players.map((p) => [p.id, p]));
  const nameOf = (p: { user_id: string | null }) => (p.user_id ? nameByUser.get(p.user_id) : "") || "";

  // Stats por jogo: só jogos oficiais terminados, uma época de cada vez (evita o limite de 1000 linhas)
  const rowsBySeason = new Map<string, PgsRow[]>();
  const gamesBySeason = new Map<string, number>();
  for (const s of seasons) {
    const sessionIds = await getOfficialGameSessionIds(admin, s.id, { finishedOnly: true });
    if (!sessionIds.length) continue;
    gamesBySeason.set(s.id, sessionIds.length);
    const { data } = await admin
      .from("player_game_stats")
      .select("player_id, pts, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, fouls_drawn, efficiency, seconds_played, plus_minus")
      .eq("season_id", s.id)
      .in("game_session_id", sessionIds);
    // Só jogadores identificados (linhas fantasma não entram)
    const rows = ((data ?? []) as PgsRow[]).filter((r) => {
      const p = playerById.get(r.player_id);
      return !!p && !!nameOf(p);
    });
    if (rows.length) rowsBySeason.set(s.id, rows);
  }

  const decorate = (a: PlayerAverages, p: { number: number | null; position: string | null; user_id: string | null }): ResumoPlayerAverages => ({
    ...a,
    name: nameOf(p),
    number: p.number,
    position: p.position,
  });

  // Época atual — por jogador da época
  const currentRows = rowsBySeason.get(current.id) ?? [];
  const currentAverages: ResumoPlayerAverages[] = aggregateAverages(
    currentRows.map((r) => ({ ...r, key: r.player_id })),
  ).map((a) => decorate(a, playerById.get(a.key)!));

  // Todas as épocas — por conta de utilizador; só se houver mais do que uma época com jogos
  const seasonsWithStats = seasons.filter((s) => rowsBySeason.has(s.id));
  let allAverages: ResumoPlayerAverages[] | null = null;
  if (seasonsWithStats.length > 1) {
    const allRows: GameStatRow[] = [];
    for (const s of seasonsWithStats) {
      for (const r of rowsBySeason.get(s.id)!) {
        const p = playerById.get(r.player_id)!;
        allRows.push({ ...r, key: p.user_id ?? p.id });
      }
    }
    // Número/posição: os da época mais recente em que o jogador consta
    const latestByKey = new Map<string, { number: number | null; position: string | null; user_id: string | null }>();
    for (const s of [...seasonsWithStats].reverse()) {
      for (const p of players.filter((x) => x.season_id === s.id)) latestByKey.set(p.user_id ?? p.id, p);
    }
    allAverages = aggregateAverages(allRows).map((a) => decorate(a, latestByKey.get(a.key)!));
  }

  // Assiduidade a treinos da época atual
  const { data: attRaw } = await admin
    .from("player_attendance_stats")
    .select("player_id, total_trainings, present, absent, justified, late, attendance_pct")
    .eq("season_id", current.id);
  const training: TrainingRow[] = ((attRaw ?? []) as {
    player_id: string; total_trainings: number | null; present: number | null; absent: number | null;
    justified: number | null; late: number | null; attendance_pct: number | string | null;
  }[])
    .map((a) => {
      const p = playerById.get(a.player_id);
      return p && nameOf(p)
        ? {
            playerId: a.player_id,
            name: nameOf(p),
            number: p.number,
            total: Number(a.total_trainings ?? 0),
            present: Number(a.present ?? 0),
            late: Number(a.late ?? 0),
            justified: Number(a.justified ?? 0),
            absent: Number(a.absent ?? 0),
            pct: Number(a.attendance_pct ?? 0),
          }
        : null;
    })
    .filter((r): r is TrainingRow => r !== null);

  return (
    <ResumoEstatisticoClient
      currentSeasonName={current.name}
      seasonsCount={seasonsWithStats.length}
      gamesCurrent={gamesBySeason.get(current.id) ?? 0}
      current={currentAverages}
      all={allAverages}
      training={training}
      myUserId={user.id}
      myPlayerIds={players.filter((p) => p.user_id === user.id).map((p) => p.id)}
    />
  );
}
