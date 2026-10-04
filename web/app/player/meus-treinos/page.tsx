import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Clock, Dumbbell, MapPin, BookOpen, Pin, CalendarDays, CheckCircle2, XCircle, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoAttendanceButton } from "@/components/trainings/auto-attendance-button";
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

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: upcoming }, { data: past }] = season
    ? await Promise.all([
        supabase.from("trainings")
          .select("id, date, start_time, end_time, location, type, notes, rsvp_deadline_hours")
          .eq("season_id", season.id).gte("date", today)
          .order("date", { ascending: true }).limit(20),
        supabase.from("trainings")
          .select("id, date, start_time, end_time, location, type, notes, rsvp_deadline_hours")
          .eq("season_id", season.id).lt("date", today)
          .order("date", { ascending: false }).limit(10),
      ])
    : [{ data: [] }, { data: [] }];

  const allTrainings = [...(upcoming ?? []), ...(past ?? [])] as TrainingRow[];
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

  function computeDeadline(t: TrainingRow): string {
    const startMs = new Date(`${t.date}T${t.start_time ?? "00:00"}`).getTime();
    return new Date(startMs - (t.rsvp_deadline_hours ?? 3) * 3_600_000).toISOString();
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

    const showAutoButton = isToday && playerRecord !== null && !myAttendance;
    const showFutureNotice = !isPast && !isToday && playerRecord !== null && !myAttendance;
    const showAttendanceBadge = isPast || (myAttendance && myAttendance.status !== null);

    const deadlineIso = computeDeadline(t);
    const deadlinePast = new Date() > new Date(deadlineIso);
    const myRsvp = rsvpByTraining.get(t.id);
    const showRsvp = playerRecord !== null && !isPast && (!deadlinePast || myRsvp);

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

            {/* Auto-Presença */}
            {!playerRecord && !isPast && (
              <p className="text-xs text-muted-foreground/70 italic">
                Sem perfil de jogador associado — contacta o teu treinador.
              </p>
            )}

            {showAutoButton && (
              <AutoAttendanceButton trainingId={t.id} currentStatus={null} />
            )}

            {showFutureNotice && (
              <p className="text-xs text-muted-foreground/60 italic">
                A auto-presença por fotografia só está disponível no dia do treino.
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
        {(upcoming ?? []).length === 0
          ? <p className="text-sm text-muted-foreground">Sem treinos agendados.</p>
          : (
            <TreinosPaginationWrapper initialCount={5} label="treinos">
              {(upcoming as TrainingRow[]).map((t) => <TrainingCard key={t.id} t={t} />)}
            </TreinosPaginationWrapper>
          )}
      </div>

      {(past ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">Treinos Anteriores</h2>
          <TreinosPaginationWrapper initialCount={5} label="treinos anteriores">
            {(past as TrainingRow[]).map((t) => <TrainingCard key={t.id} t={t} isPast />)}
          </TreinosPaginationWrapper>
        </div>
      )}
    </div>
  );
}
