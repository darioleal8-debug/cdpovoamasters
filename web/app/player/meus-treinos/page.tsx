import { todayInClubTz } from "@/lib/time/club-time";
import { isAttendanceOpen, attendanceCloseHHMM } from "@/lib/time/attendance-window";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Clock, Dumbbell, MapPin, BookOpen, Pin, CalendarDays, CheckCircle2, XCircle, MessageSquare, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GpsCheckinButton } from "@/components/trainings/gps-checkin-button";
import { RsvpButtons } from "@/components/trainings/rsvp-buttons";
import { TreinosPaginationWrapper } from "./TreinosPaginationWrapper";

export const metadata = { title: "Os Meus Treinos" };

type TrainingRow = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  type?: string;
  notes?: string;
  rsvp_deadline_hours: number;
};
type CoachNote = { id: string; training_id: string; note_text: string };
type AttendanceRow = {
  training_id: string;
  status: string;
  photo_url: string | null;
  gps_validated: boolean;
  gps_distance_m: number | null;
};
type RsvpRow = {
  training_id: string;
  status: "going" | "not_going";
  reason_code: string | null;
  reason_text: string | null;
};
type TeamRsvpEntry = { player_id: string; name: string | null; number: number | null };
type TeamRsvpSummary = { going: TeamRsvpEntry[]; not_going: TeamRsvpEntry[] };

const TYPE_LABELS: Record<string, string> = {
  tecnico: "Técnico", fisico: "Físico", tatico: "Tático",
  recuperacao: "Recuperação", coletivo: "Coletivo",
  individual: "Individual", geral: "Geral",
};

const TYPE_COLORS: Record<string, string> = {
  tecnico: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  fisico: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  tatico: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  recuperacao: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300",
  coletivo: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  individual: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300",
  geral: "bg-muted text-muted-foreground",
};

const ATTENDANCE_STATUS: Record<string, { label: string; badge: string }> = {
  present:      { label: "Presente",      badge: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300" },
  late:         { label: "Atraso",        badge: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300" },
  justified:    { label: "Justificada",   badge: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300" },
  absent:       { label: "Falta",         badge: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300" },
  auto_present: { label: "Pendente",      badge: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300" },
};

export default async function MeusTreinosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: season } = await supabase
    .from("seasons").select("id").eq("status", "ativa").maybeSingle();

  // Hora actual em Lisboa (Portugal usa Europe/Lisbon — UTC+1 no verão, UTC+0 no inverno)
  const nowDate      = new Date();
  const lisbonNowStr = nowDate.toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" });
  const today        = todayInClubTz();
  const yesterday    = todayInClubTz(new Date(nowDate.getTime() - 86_400_000));
  const nowHHMM      = lisbonNowStr.slice(11, 16);

  const [{ data: upcomingRaw }, { data: pastRaw }] = season
    ? await Promise.all([
        supabase.from("trainings")
          .select("id, date, start_time, end_time, location, type, notes, rsvp_deadline_hours")
          .eq("season_id", season.id).gte("date", yesterday)
          .order("date", { ascending: true }).limit(21),
        supabase.from("trainings")
          .select("id, date, start_time, end_time, location, type, notes, rsvp_deadline_hours")
          .eq("season_id", season.id).lt("date", yesterday)
          .order("date", { ascending: false }).limit(10),
      ])
    : [{ data: [] }, { data: [] }];

  // Move yesterday's trainings with a closed window into the past bucket
  const upcoming: TrainingRow[] = [];
  const pastExtra: TrainingRow[] = [];
  for (const t of (upcomingRaw ?? []) as TrainingRow[]) {
    if (t.date < today && !isAttendanceOpen(t, nowDate)) {
      pastExtra.push(t);
    } else {
      upcoming.push(t);
    }
  }
  const past: TrainingRow[] = [...pastExtra, ...((pastRaw ?? []) as TrainingRow[])];

  const allTrainings = [...upcoming, ...past];
  const trainingIds = allTrainings.map((t) => t.id);

  // Registo de jogador
  const { data: playerRecord } = season
    ? await supabase
        .from("players").select("id")
        .eq("user_id", user.id).eq("season_id", season.id).maybeSingle()
    : { data: null };

  // Presenças
  const { data: attendanceRows } =
    playerRecord && trainingIds.length
      ? await supabase
          .from("training_attendance")
          .select("training_id, status, photo_url, gps_validated, gps_distance_m")
          .eq("player_id", playerRecord.id)
          .in("training_id", trainingIds)
      : { data: [] as AttendanceRow[] };

  const attendanceByTraining = new Map<string, AttendanceRow>();
  for (const a of (attendanceRows ?? []) as AttendanceRow[]) {
    attendanceByTraining.set(a.training_id, a);
  }

  // RSVPs do jogador
  const { data: rsvpRows } =
    playerRecord && trainingIds.length
      ? await supabase
          .from("training_rsvps")
          .select("training_id, status, reason_code, reason_text")
          .eq("player_id", playerRecord.id)
          .in("training_id", trainingIds)
      : { data: [] as RsvpRow[] };

  const rsvpByTraining = new Map<string, RsvpRow>();
  for (const r of (rsvpRows ?? []) as RsvpRow[]) {
    rsvpByTraining.set(r.training_id, r);
  }

  // Notas do treinador
  const { data: coachNotes } = trainingIds.length
    ? await supabase.from("training_notes").select("id, training_id, note_text")
        .in("training_id", trainingIds).order("created_at", { ascending: true })
    : { data: [] as CoachNote[] };

  const notesByTraining = new Map<string, CoachNote[]>();
  for (const n of (coachNotes ?? []) as CoachNote[]) {
    const list = notesByTraining.get(n.training_id) ?? [];
    list.push(n);
    notesByTraining.set(n.training_id, list);
  }

  // RSVPs de TODA a equipa (para mostrar quem vai / não vai)
  // players.name removido na migration 041 — nome via users.name
  type TeamRsvpRaw = {
    training_id: string; player_id: string; status: string;
    players: { user_id: string | null; number: number | null } | null;
  };
  const { data: teamRsvpRaw } = trainingIds.length
    ? await supabase
        .from("training_rsvps")
        .select("training_id, player_id, status, players(user_id, number)")
        .in("training_id", trainingIds)
    : { data: [] as TeamRsvpRaw[] };

  const teamRows = (teamRsvpRaw ?? []) as TeamRsvpRaw[];
  const teamUserIds = [
    ...new Set(teamRows.map(r => (r.players as { user_id?: string | null } | null)?.user_id).filter((id): id is string => !!id)),
  ];
  const { data: teamUsersData } = teamUserIds.length
    ? await supabase.from("users").select("id, name").in("id", teamUserIds)
    : { data: [] as { id: string; name: string }[] };
  const teamNameMap = Object.fromEntries(
    (teamUsersData ?? []).map(u => [(u as { id: string; name: string }).id, (u as { id: string; name: string }).name])
  );

  const teamRsvpsByTraining = new Map<string, TeamRsvpSummary>();
  for (const r of teamRows) {
    const p = r.players as { user_id?: string | null; number?: number | null } | null;
    const uid = p?.user_id ?? null;
    const entry: TeamRsvpEntry = {
      player_id: r.player_id,
      name:   uid ? (teamNameMap[uid] ?? null) : null,
      number: typeof p?.number === "number" ? p.number : null,
    };
    const cur = teamRsvpsByTraining.get(r.training_id) ?? { going: [], not_going: [] };
    if (r.status === "going")     cur.going.push(entry);
    else if (r.status === "not_going") cur.not_going.push(entry);
    teamRsvpsByTraining.set(r.training_id, cur);
  }
  // Sort each list by number asc (nulls last), then name
  for (const s of teamRsvpsByTraining.values()) {
    const cmp = (a: TeamRsvpEntry, b: TeamRsvpEntry) => {
      if (a.number == null && b.number != null) return 1;
      if (a.number != null && b.number == null) return -1;
      if (a.number !== b.number) return (a.number ?? 0) - (b.number ?? 0);
      return (a.name ?? "").localeCompare(b.name ?? "", "pt");
    };
    s.going.sort(cmp);
    s.not_going.sort(cmp);
  }

  function computeDeadline(t: TrainingRow): string {
    return new Date(`${t.date}T${t.start_time ?? "00:00"}`).toISOString();
  }

  function TrainingCard({ t, isPast = false }: { t: TrainingRow; isPast?: boolean }) {
    const dbNotes = notesByTraining.get(t.id) ?? [];
    const allNotes: string[] = [
      ...(t.notes?.trim() ? [t.notes.trim()] : []),
      ...dbNotes.map((n) => n.note_text),
    ];

    const typeLabel = t.type ? (TYPE_LABELS[t.type] ?? t.type) : null;
    const typeColor = t.type ? (TYPE_COLORS[t.type] ?? TYPE_COLORS.geral) : TYPE_COLORS.geral;
    const trainingYear = new Date(`${t.date}T12:00:00`).getFullYear();
    const dateStr = new Date(`${t.date}T12:00:00`).toLocaleDateString("pt-PT", {
      weekday: "long", day: "numeric", month: "long",
      ...(trainingYear !== new Date().getFullYear() ? { year: "numeric" } : {}),
    });

    const myAttendance = attendanceByTraining.get(t.id);
    const attendanceInfo = myAttendance ? ATTENDANCE_STATUS[myAttendance.status] : null;
    const isToday = t.date === today;

    const startHHMM = t.start_time?.slice(0, 5) ?? null;

    const checkinOpen   = isAttendanceOpen(t, nowDate);
    const closeHHMM     = checkinOpen ? attendanceCloseHHMM(t) : null;
    // still before training starts (today or future)
    const checkinBefore = !checkinOpen && !!startHHMM &&
                          (t.date > today || (t.date === today && nowHHMM < startHHMM));
    // window has closed after the training
    const checkinClosed = !checkinOpen && !checkinBefore && !!startHHMM && t.date <= today;

    const showCheckinButton = checkinOpen  && playerRecord !== null && !myAttendance;
    const showFutureNotice  = checkinBefore && t.date > today && playerRecord !== null && !myAttendance;
    const showAttendanceBadge = isPast || (myAttendance && myAttendance.status !== null);

    const deadlineIso = computeDeadline(t);
    const deadlinePast = new Date() > new Date(deadlineIso);
    const myRsvp = rsvpByTraining.get(t.id);
    const showRsvp = playerRecord !== null && !isPast && (!deadlinePast || myRsvp);
    const teamSummary = teamRsvpsByTraining.get(t.id);

    return (
      <Card className={`overflow-hidden transition-opacity ${isPast ? "opacity-60" : ""}`}>
        <div className="flex">
          <div
            className="w-1 shrink-0"
            style={{ backgroundColor: isPast ? "var(--muted)" : "var(--club-primary, #0a2647)" }}
          />
          <CardContent className="flex-1 p-4 space-y-3">

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Treino</span>
                  {typeLabel && (
                    <Badge variant="outline" className={`text-[11px] capitalize ${typeColor}`}>
                      {typeLabel}
                    </Badge>
                  )}
                  {isToday && (
                    <Badge variant="outline" className="text-[11px] bg-primary/10 text-primary border-primary/30">
                      Hoje
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {dateStr}
                  </span>
                  {t.start_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t.start_time.slice(0, 5)}{t.end_time ? `–${t.end_time.slice(0, 5)}` : ""}h
                    </span>
                  )}
                  {t.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {t.location}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isPast && (
                  <Badge variant="secondary" className="text-[11px]">Terminado</Badge>
                )}
                {showAttendanceBadge && (
                  attendanceInfo ? (
                    <Badge variant="outline" className={`text-[11px] ${attendanceInfo.badge}`}>
                      {myAttendance?.status === "present" && myAttendance.photo_url && (
                        <CheckCircle2 className="h-3 w-3 mr-1 inline" />
                      )}
                      {myAttendance?.status === "absent" && <XCircle className="h-3 w-3 mr-1 inline" />}
                      {attendanceInfo.label}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700">
                      Sem registo
                    </Badge>
                  )
                )}
              </div>
            </div>

            {/* RSVP */}
            {showRsvp && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Confirmação de Presença
                  </span>
                  {!myRsvp && !deadlinePast && (
                    <span className="text-[11px] font-bold rounded-full bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 leading-none dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                      Pendente
                    </span>
                  )}
                </div>
                <RsvpButtons
                  trainingId={t.id}
                  deadlineIso={deadlineIso}
                  initialStatus={myRsvp?.status ?? null}
                />
              </div>
            )}

            {/* Confirmações da equipa */}
            {teamSummary && (teamSummary.going.length > 0 || teamSummary.not_going.length > 0) && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Confirmações
                  </span>
                  {teamSummary.going.length > 0 && (
                    <span className="text-[11px] font-bold rounded-full bg-green-100 text-green-700 border border-green-300 px-1.5 py-0.5 leading-none dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
                      {teamSummary.going.length} {teamSummary.going.length === 1 ? "vai" : "vão"}
                    </span>
                  )}
                  {teamSummary.not_going.length > 0 && (
                    <span className="text-[11px] font-bold rounded-full bg-red-100 text-red-700 border border-red-300 px-1.5 py-0.5 leading-none dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">
                      {teamSummary.not_going.length} não {teamSummary.not_going.length === 1 ? "vai" : "vão"}
                    </span>
                  )}
                </div>

                {teamSummary.going.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {teamSummary.going.map((p) => (
                      <span
                        key={p.player_id}
                        className="inline-flex items-center gap-1 text-[11px] rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800"
                      >
                        {p.number != null && <span className="opacity-50 text-[10px]">#{p.number}</span>}
                        {p.name ? p.name.split(" ")[0] : "—"}
                      </span>
                    ))}
                  </div>
                )}

                {teamSummary.not_going.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {teamSummary.not_going.map((p) => (
                      <span
                        key={p.player_id}
                        className="inline-flex items-center gap-1 text-[11px] rounded-full bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800"
                      >
                        {p.number != null && <span className="opacity-50 text-[10px]">#{p.number}</span>}
                        {p.name ? p.name.split(" ")[0] : "—"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Marcação de presença por GPS */}
            {!playerRecord && !isPast && (
              <p className="text-xs text-muted-foreground/70 italic">
                Sem perfil de jogador associado — contacta o teu treinador.
              </p>
            )}

            {showCheckinButton && (
              <GpsCheckinButton trainingId={t.id} />
            )}

            {checkinBefore && playerRecord && !myAttendance && (
              <p className="text-xs text-muted-foreground/60 italic">
                A marcação de presença abre às {startHHMM}h.
              </p>
            )}

            {checkinClosed && playerRecord && !myAttendance && (
              <p className="text-xs text-muted-foreground/60 italic">
                O registo de presença fechou às {closeHHMM}h.
              </p>
            )}

            {showFutureNotice && (
              <p className="text-xs text-muted-foreground/60 italic">
                A marcação de presença está disponível no dia do treino a partir das {startHHMM ?? "hora de início"}h.
              </p>
            )}

            {/* Notas do treinador */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Notas do Treinador
                </span>
                {allNotes.length > 0 && (
                  <span className="text-[11px] font-bold rounded-full bg-primary/10 text-primary px-1.5 py-0.5 leading-none">
                    {allNotes.length}
                  </span>
                )}
              </div>

              {allNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic pl-1">
                  Este treino não tem notas.
                </p>
              ) : (
                <div className="space-y-2">
                  {allNotes.map((text, i) => (
                    <div
                      key={i}
                      className="flex gap-2.5 rounded-lg border border-blue-200/60 bg-blue-50/70 px-3 py-2.5 dark:border-blue-800/40 dark:bg-blue-950/20"
                    >
                      <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-45 text-blue-500 dark:text-blue-400" />
                      <p className="text-xs font-medium text-foreground/90 leading-relaxed whitespace-pre-wrap">
                        {text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </CardContent>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Os Meus Treinos</h1>
        <p className="text-muted-foreground">Agenda de treinos da equipa.</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Próximos Treinos</h2>
        {upcoming.length === 0
          ? <p className="text-sm text-muted-foreground">Sem treinos agendados.</p>
          : (
            <TreinosPaginationWrapper initialCount={5} label="treinos">
              {upcoming.map((t) => <TrainingCard key={t.id} t={t} />)}
            </TreinosPaginationWrapper>
          )}
      </div>

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">Treinos Anteriores</h2>
          <TreinosPaginationWrapper initialCount={5} label="treinos anteriores">
            {past.map((t) => <TrainingCard key={t.id} t={t} isPast />)}
          </TreinosPaginationWrapper>
        </div>
      )}
    </div>
  );
}
