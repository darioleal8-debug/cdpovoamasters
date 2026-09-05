"use client";


interface Avatar {
  id:        string;
  name:      string;
  photo_url: string | null;
}

interface NextTrainingData {
  id:             string;
  event_date:     string;
  event_time:     string | null;
  location:       string | null;
  training_kind:  string | null;
  attended_count: number;
  roster_size:    number;
  top_avatars:    Avatar[];
}

interface Props {
  training: NextTrainingData | null;
  loading?: boolean;
}

function fmtDate(d: string, t?: string | null): string {
  const day = new Date(d + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "numeric", month: "short",
  });
  const cap = day.charAt(0).toUpperCase() + day.slice(1);
  return t ? `${cap} · ${t.slice(0, 5).replace(":", "h")}` : cap;
}

function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((new Date(dateStr + "T00:00:00").getTime() - today) / 86_400_000);
}

function initials(name: string): string {
  const p = name.trim().split(" ");
  return p.length > 1 ? `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase() : p[0].slice(0, 2).toUpperCase();
}

const KIND_LABEL: Record<string, string> = {
  tecnica: "Técnica", fisica: "Física", tatica: "Tática", jogo: "Jogo interno", mista: "Mista",
};

export function NextTrainingCard({ training, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-4 animate-pulse"
        style={{ background: "var(--paper, #F6F7F9)", border: "1px solid var(--line, #E4E7EE)" }}>
        <div className="h-3 w-24 rounded-full bg-black/10" />
        <div className="h-5 w-40 rounded-lg bg-black/10" />
        <div className="h-3 w-32 rounded-full bg-black/8" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-2"
        style={{ background: "var(--paper, #F6F7F9)", border: "1px solid var(--line, #E4E7EE)" }}>
        <p className="text-[11px] font-bold uppercase tracking-label" style={{ color: "var(--muted-text,#5A6478)" }}>
          Próximo treino
        </p>
        <p className="text-sm font-semibold" style={{ color: "var(--muted-text,#5A6478)" }}>
          Sem treinos agendados
        </p>
      </div>
    );
  }

  const days = daysUntil(training.event_date);
  const dayStr = days === 0 ? "Hoje" : days === 1 ? "Amanhã" : `${days} dias`;
  const pct = training.roster_size > 0 ? Math.round(training.attended_count / training.roster_size * 100) : 0;

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: "var(--paper, #F6F7F9)", border: "1px solid var(--line, #E4E7EE)" }}>

      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-label" style={{ color: "var(--muted-text,#5A6478)" }}>
          Próximo treino
        </p>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(20,33,61,.07)", color: "var(--navy,#14213D)" }}
        >
          {dayStr}
        </span>
      </div>

      <div>
        <p className="font-semibold text-sm" style={{ color: "var(--text,#0F1729)" }}>
          {training.training_kind ? (KIND_LABEL[training.training_kind] ?? training.training_kind) : "Treino"}
        </p>
        <p className="text-[12px] mt-0.5 capitalize" style={{ color: "var(--muted-text,#5A6478)" }}>
          {fmtDate(training.event_date, training.event_time)}
          {training.location ? ` · ${training.location}` : ""}
        </p>
      </div>

      {/* Avatares e presença */}
      {training.roster_size > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {training.top_avatars.slice(0, 4).map((a) => (
              <div key={a.id}
                className="h-7 w-7 shrink-0 rounded-full border-2 border-white overflow-hidden"
                style={{ background: "var(--navy,#14213D)" }}
                title={a.name}
              >
                {a.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photo_url} alt={a.name} width={28} height={28} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-white">
                    {initials(a.name)}
                  </span>
                )}
              </div>
            ))}
            {training.top_avatars.length < training.attended_count && (
              <div
                className="h-7 w-7 shrink-0 rounded-full border-2 border-white flex items-center justify-center"
                style={{ background: "var(--ink,#0A1220)" }}
              >
                <span className="text-[8px] font-bold text-white">+{training.attended_count - training.top_avatars.length}</span>
              </div>
            )}
          </div>
          <span className="text-[12px]" style={{ color: "var(--muted-text,#5A6478)" }}>
            {training.attended_count}/{training.roster_size} presentes
          </span>
        </div>
      )}
    </div>
  );
}
