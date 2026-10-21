import { createClient } from "@/lib/supabase/server";
import { todayInClubTz } from "@/lib/time/club-time";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Calendar, Check, Clock, HelpCircle, MapPin, X } from "lucide-react";
import Link from "next/link";
import type { AvailabilityRosterRow } from "@/types/availability";
import { AvailabilityPrompt } from "@/components/player/availability-prompt";

type Props = { params: Promise<{ id: string }> };

const TYPE_LABELS: Record<string, string> = {
  tecnico: "Técnico", fisico: "Físico", tatico: "Tático",
  recuperacao: "Recuperação", coletivo: "Coletivo",
  individual: "Individual", geral: "Geral",
};

const REASON_LABELS: Record<string, string> = {
  lesao: "Lesão", trabalho: "Trabalho", compromisso: "Compromisso pessoal",
  doenca: "Doença", viagem: "Viagem", outro: "Outro",
};

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function PlayerRow({ row, accent }: { row: AvailabilityRosterRow; accent: string }) {
  const reason = row.reason_code
    ? (REASON_LABELS[row.reason_code] ?? row.reason_code)
    : row.reason_text ?? null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-b-0">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: accent }}
      >
        {initials(row.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">
          {row.jersey_number ? <span className="text-muted-foreground mr-1">#{row.jersey_number}</span> : null}
          {row.name}
        </p>
        {reason && (
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">{reason}</p>
        )}
      </div>
    </div>
  );
}

export default async function TrainingDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: training } = await supabase
    .from("trainings")
    .select("id, date, start_time, location, type, notes, rsvp_deadline_hours, season_id")
    .eq("id", id)
    .maybeSingle();

  if (!training) notFound();

  const today = todayInClubTz();
  const isPast = (training.date as string) < today;

  // Lock RSVP changes once the training has started
  const deadlineIso = new Date(`${training.date}T${(training.start_time as string | null) ?? "00:00"}`).toISOString();

  // Player's own RSVP
  const { data: playerRecord } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let myRsvpStatus: "going" | "not_going" | null = null;
  if (playerRecord) {
    const { data: rsvpRow } = await supabase
      .from("training_rsvps")
      .select("status")
      .eq("training_id", id)
      .eq("player_id", playerRecord.id)
      .maybeSingle();
    myRsvpStatus = (rsvpRow?.status as "going" | "not_going") ?? null;
  }

  const { data: rosterRows } = await supabase.rpc("training_rsvp_roster", {
    p_training_id: id,
  });

  const roster = (rosterRows ?? []) as AvailabilityRosterRow[];
  const going    = roster.filter((r) => r.status === "going");
  const notGoing = roster.filter((r) => r.status === "not_going");
  const pending  = roster.filter((r) => !r.status);

  const typeLabel = training.type
    ? (TYPE_LABELS[training.type] ?? training.type)
    : null;

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Voltar */}
      <div>
        <Link
          href="/player/minha-area"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Minha Área
        </Link>
      </div>

      {/* Info do treino */}
      <div
        className="rounded-xl px-5 py-5 text-white"
        style={{ backgroundColor: "#3b5f92" }}
      >
        <p className="text-[0.65rem] font-bold uppercase tracking-widest opacity-60 mb-2">
          Treino{typeLabel ? ` · ${typeLabel}` : ""}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm opacity-85">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {fmtDate(training.date)}
          </span>
          {training.start_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {training.start_time.slice(0, 5)}h
            </span>
          )}
          {training.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {training.location}
            </span>
          )}
        </div>
        {training.notes && (
          <p className="mt-3 text-sm opacity-75 leading-relaxed">{training.notes}</p>
        )}
      </div>

      {/* A minha confirmação */}
      {playerRecord && !isPast && (
        <div className="rounded-xl border bg-card px-4 py-4">
          <AvailabilityPrompt
            kind="training"
            eventId={id}
            deadlineIso={deadlineIso}
            initialAnswer={
              myRsvpStatus === "going"     ? "yes" :
              myRsvpStatus === "not_going" ? "no"  : null
            }
          />
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card px-4 py-3 text-center">
          <p className="text-2xl font-bold text-green-600">{going.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Vão</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 text-center">
          <p className="text-2xl font-bold text-red-500">{notGoing.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Não vão</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{pending.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Sem resposta</p>
        </div>
      </div>

      {/* Vão */}
      {going.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-green-50 dark:bg-green-950/20">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
              Vão ({going.length})
            </span>
          </div>
          <div className="px-4">
            {going.map((r) => (
              <PlayerRow key={r.player_id} row={r} accent="#3b5f92" />
            ))}
          </div>
        </div>
      )}

      {/* Não vão */}
      {notGoing.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-red-50 dark:bg-red-950/20">
            <X className="h-4 w-4 text-red-500" />
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
              Não vão ({notGoing.length})
            </span>
          </div>
          <div className="px-4">
            {notGoing.map((r) => (
              <PlayerRow key={r.player_id} row={r} accent="#ef4444" />
            ))}
          </div>
        </div>
      )}

      {/* Sem resposta */}
      {pending.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">
              Sem resposta ({pending.length})
            </span>
          </div>
          <div className="px-4">
            {pending.map((r) => (
              <PlayerRow key={r.player_id} row={r} accent="#9ca3af" />
            ))}
          </div>
        </div>
      )}

      {roster.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Ainda não há respostas para este treino.
        </p>
      )}

    </div>
  );
}
