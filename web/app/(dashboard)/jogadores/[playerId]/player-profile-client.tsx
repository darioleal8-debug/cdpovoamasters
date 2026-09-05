"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { POSITION_LABELS } from "@/lib/utils";
import { calculateAge } from "@/lib/age";

// ── Types ──────────────────────────────────────────────────────────────────

interface PlayerData {
  number: number | null; position: string | null;
  height: number | null; weight: number | null;
  age: number | null; birth_date: string | null; photo_url: string | null;
}
interface UserRow  { name: string; email: string; phone: string | null; role: string }
interface SeasonInfo { id: string; name: string }

interface Payment {
  id: string; month: number; reference_year: number;
  amount: number | null; amount_due: number | null;
  status: string | null; payment_date: string | null; method: string | null;
}
interface Callup {
  id: string; game_id: string; created_at: string;
  event: { id: string; event_date: string | null; opponent: string | null; title: string; competition: string | null } | null;
}
interface GameStat {
  id: string; game_session_id: string;
  pts: number; reb_off: number; reb_def: number; ast: number;
  stl: number; blk: number; tov: number;
  fg2_made: number; fg2_att: number; fg3_made: number; fg3_att: number;
  ft_made: number; ft_att: number; minutes_played: number; efficiency: number;
  session: { home_score: number; away_score: number; opponent_name: string; event_date: string | null } | null;
}
interface TrainingRow {
  id: string; date: string; type: string | null; location: string | null; status: string | null;
}
interface AttendanceStats {
  total_trainings: number; present: number; absent: number;
  justified: number; late: number; attendance_pct: number;
}

interface Props {
  playerId: string;
  player:  PlayerData;
  userRow: UserRow;
  season:  SeasonInfo;
  payments:     Payment[];
  callups:      Callup[];
  gameStats:    GameStat[];
  trainings:    TrainingRow[];
  attendanceStats: AttendanceStats | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const STATUS_LABEL: Record<string, string> = {
  paid: "Pago", partial: "Parcial", late: "Em atraso", exempt: "Isento",
};
const STATUS_COLOR: Record<string, string> = {
  paid:    "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  late:    "bg-red-100 text-red-800",
  exempt:  "bg-gray-100 text-gray-500",
};
const ATT_LABEL: Record<string, string> = {
  present: "Presente", absent: "Falta", justified: "Justificado", late: "Atraso",
};
const ATT_COLOR: Record<string, string> = {
  present:   "bg-green-100 text-green-800",
  absent:    "bg-red-100 text-red-700",
  justified: "bg-amber-100 text-amber-800",
  late:      "bg-blue-100 text-blue-800",
};
const POSITION_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  base: "default", extremo: "secondary", poste: "outline",
};

function fmt(v: number) {
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}
function pct(made: number, att: number) {
  return att > 0 ? Math.round((made / att) * 100) : null;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
        ${active
          ? "border-orange-500 text-orange-600"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
    >
      {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

type Tab = "pagamentos" | "jogos" | "treinos";

export function PlayerProfileClient({
  player, userRow, season,
  payments, callups, gameStats, trainings, attendanceStats,
}: Props) {
  const [tab, setTab] = useState<Tab>("pagamentos");

  const age = player.birth_date ? calculateAge(player.birth_date) : player.age;
  const initials = userRow.name.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // ── Summary stats ──────────────────────────────────────────
  const paidPayments  = payments.filter((p) => p.status === "paid" || p.status === "partial");
  const totalPayments = payments.filter((p) => p.status !== "exempt");
  const totalPago     = paidPayments.reduce((s, p) => s + (p.amount ?? 0), 0);

  const gamesWithStats = gameStats.length;
  const avgPts = gamesWithStats > 0
    ? (gameStats.reduce((s, g) => s + g.pts, 0) / gamesWithStats).toFixed(1) : null;

  const attPct = attendanceStats?.attendance_pct ?? null;

  return (
    <div className="space-y-6">

      {/* ── Back nav ──────────────────────────────────────────── */}
      <div>
        <Link
          href="/jogadores"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Plantel
        </Link>
      </div>

      {/* ── Profile header ───────────────────────────────────── */}
      <div className="flex items-start gap-5">
        {/* Avatar */}
        <div className="shrink-0">
          {player.photo_url ? (
            <img
              src={player.photo_url}
              alt={userRow.name}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-orange-100 ring-2 ring-border flex items-center justify-center">
              {initials
                ? <span className="text-2xl font-bold text-orange-600">{initials}</span>
                : <User className="h-8 w-8 text-orange-400" />}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {player.number != null && (
              <span className="text-3xl font-black text-orange-500 font-mono leading-none">
                #{player.number}
              </span>
            )}
            <h1 className="text-2xl font-bold tracking-tight truncate">{userRow.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {player.position && (
              <Badge variant={POSITION_BADGE_VARIANT[player.position] ?? "outline"}>
                {POSITION_LABELS[player.position as keyof typeof POSITION_LABELS] ?? player.position}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{season.name}</span>
          </div>
          {/* Physical */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-sm text-muted-foreground">
            {player.height && <span>{player.height} cm</span>}
            {player.weight && <span>{player.weight} kg</span>}
            {age != null && <span>{age} anos</span>}
            {userRow.email && <span className="truncate">{userRow.email}</span>}
          </div>
        </div>
      </div>

      {/* ── Summary cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Convocatórias"
          value={callups.length}
          sub={gamesWithStats > 0 ? `${gamesWithStats} c/ stats` : undefined}
        />
        <StatCard
          label="Média Pontos"
          value={avgPts ?? "—"}
          sub={gamesWithStats > 0 ? `em ${gamesWithStats} jogo${gamesWithStats !== 1 ? "s" : ""}` : "sem dados"}
        />
        <StatCard
          label="Presença Treinos"
          value={attPct != null ? `${Math.round(attPct)}%` : "—"}
          sub={attendanceStats ? `${attendanceStats.present}/${attendanceStats.total_trainings} treinos` : "sem dados"}
        />
        <StatCard
          label="Quotas Pagas"
          value={`${paidPayments.length}/${totalPayments.length}`}
          sub={totalPago > 0 ? fmt(totalPago) : undefined}
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div>
        <div className="flex border-b gap-1 overflow-x-auto">
          <TabBtn label="Pagamentos"  active={tab === "pagamentos"} onClick={() => setTab("pagamentos")} />
          <TabBtn label={`Jogos (${callups.length})`}   active={tab === "jogos"}   onClick={() => setTab("jogos")} />
          <TabBtn label={`Treinos (${trainings.length})`} active={tab === "treinos"} onClick={() => setTab("treinos")} />
        </div>

        {/* ── Pagamentos ──────────────────────────────────────── */}
        {tab === "pagamentos" && (
          <div className="mt-4 space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-2 gap-3">
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Pago</p>
                <p className="text-xl font-bold text-green-700">{fmt(totalPago)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Em Dívida</p>
                <p className="text-xl font-bold text-red-600">
                  {fmt(payments
                    .filter((p) => p.status !== "paid" && p.status !== "exempt")
                    .reduce((s, p) => {
                      if (p.status === "partial") return s + Math.max(0, (p.amount_due ?? 0) - (p.amount ?? 0));
                      return s + (p.amount_due ?? 0);
                    }, 0))}
                </p>
              </CardContent></Card>
            </div>

            {/* Lista */}
            <Card>
              <CardContent className="p-0">
                {payments.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum pagamento registado.
                  </div>
                ) : (
                  <div className="divide-y">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">
                            {MONTH_NAMES[(p.month ?? 1) - 1]} {p.reference_year}
                          </p>
                          {p.payment_date && (
                            <p className="text-xs text-muted-foreground">
                              Pago em {fmtDate(p.payment_date)}
                              {p.method ? ` · ${p.method}` : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold tabular-nums">
                            {p.amount != null ? fmt(p.amount) : fmt(p.amount_due ?? 0)}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[p.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABEL[p.status ?? ""] ?? p.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Jogos ───────────────────────────────────────────── */}
        {tab === "jogos" && (
          <div className="mt-4 space-y-4">
            {/* Médias (se houver stats) */}
            {gameStats.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                    Médias por jogo ({gameStats.length} jogos)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 md:grid-cols-7 gap-3 text-center">
                    {[
                      { label: "PTS",  val: avg(gameStats, "pts") },
                      { label: "REB",  val: avgFn(gameStats, (g) => g.reb_off + g.reb_def) },
                      { label: "AST",  val: avg(gameStats, "ast") },
                      { label: "STL",  val: avg(gameStats, "stl") },
                      { label: "BLK",  val: avg(gameStats, "blk") },
                      { label: "TOV",  val: avg(gameStats, "tov") },
                      { label: "EFF",  val: avg(gameStats, "efficiency") },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex flex-col items-center gap-0.5">
                        <span className="text-xs text-muted-foreground font-medium">{label}</span>
                        <span className="text-lg font-bold tabular-nums">{val}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lista de convocatórias */}
            <Card>
              <CardContent className="p-0">
                {callups.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Sem convocatórias nesta temporada.
                  </div>
                ) : (
                  <div className="divide-y">
                    {callups.map((c) => {
                      const stats = gameStats.find((g) => g.session?.event_date === c.event?.event_date);
                      return (
                        <div key={c.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">
                                {c.event?.opponent ?? c.event?.title ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {fmtDate(c.event?.event_date ?? null)}
                                {c.event?.competition ? ` · ${c.event.competition}` : ""}
                              </p>
                            </div>
                            {stats && (
                              <div className="flex items-center gap-3 shrink-0 text-xs">
                                <span className="font-bold text-sm">{stats.pts}pts</span>
                                <span className="text-muted-foreground">{stats.reb_off + stats.reb_def}reb</span>
                                <span className="text-muted-foreground">{stats.ast}ast</span>
                                {stats.minutes_played > 0 && (
                                  <span className="text-muted-foreground">{Math.round(stats.minutes_played)}min</span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Shooting detail */}
                          {stats && (stats.fg2_att > 0 || stats.fg3_att > 0 || stats.ft_att > 0) && (
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                              {stats.fg2_att > 0 && (
                                <span>2P: {stats.fg2_made}/{stats.fg2_att} ({pct(stats.fg2_made, stats.fg2_att)}%)</span>
                              )}
                              {stats.fg3_att > 0 && (
                                <span>3P: {stats.fg3_made}/{stats.fg3_att} ({pct(stats.fg3_made, stats.fg3_att)}%)</span>
                              )}
                              {stats.ft_att > 0 && (
                                <span>LL: {stats.ft_made}/{stats.ft_att} ({pct(stats.ft_made, stats.ft_att)}%)</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Treinos ─────────────────────────────────────────── */}
        {tab === "treinos" && (
          <div className="mt-4 space-y-4">
            {/* Barra de presença */}
            {attendanceStats && attendanceStats.total_trainings > 0 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Taxa de presença</span>
                    <span className="text-xl font-bold tabular-nums text-green-700">
                      {Math.round(attendanceStats.attendance_pct)}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(100, attendanceStats.attendance_pct)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    {[
                      { label: "Presentes", val: attendanceStats.present,   color: "text-green-700" },
                      { label: "Faltas",    val: attendanceStats.absent,    color: "text-red-600" },
                      { label: "Justif.",   val: attendanceStats.justified, color: "text-amber-700" },
                      { label: "Atrasos",   val: attendanceStats.late,      color: "text-blue-700" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span className={`text-lg font-bold tabular-nums ${color}`}>{val}</span>
                        <span className="text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lista de treinos */}
            <Card>
              <CardContent className="p-0">
                {trainings.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum treino nesta temporada.
                  </div>
                ) : (
                  <div className="divide-y">
                    {trainings.map((t) => (
                      <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <p className="text-sm font-medium">{fmtDate(t.date)}</p>
                          {t.location && (
                            <p className="text-xs text-muted-foreground">{t.location}</p>
                          )}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          t.status
                            ? (ATT_COLOR[t.status] ?? "bg-gray-100 text-gray-500")
                            : "bg-gray-100 text-gray-400"
                        }`}>
                          {t.status ? (ATT_LABEL[t.status] ?? t.status) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat helpers ────────────────────────────────────────────────────────────

function avg(stats: GameStat[], key: keyof GameStat): string {
  if (!stats.length) return "—";
  const total = stats.reduce((s, g) => s + Number(g[key] ?? 0), 0);
  return (total / stats.length).toFixed(1);
}

function avgFn(stats: GameStat[], fn: (g: GameStat) => number): string {
  if (!stats.length) return "—";
  return (stats.reduce((s, g) => s + fn(g), 0) / stats.length).toFixed(1);
}
