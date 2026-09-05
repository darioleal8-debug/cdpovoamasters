"use client";

import type { EventGameThread, EventTrainingThread, ChatLastMessage } from "@/types/database";

type EventThread = EventGameThread | EventTrainingThread;

interface Props {
  thread:  EventThread;
  active:  boolean;
  onClick: () => void;
}

const KIND_LABEL: Record<string, string> = {
  geral: "Geral", tecnica: "Técnica", fisica: "Física",
  tatica: "Tática", jogo: "Jogo interno", mista: "Mista",
};

function fmtDate(dateStr: string, timeStr: string | null): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString("pt-PT", { weekday: "short", timeZone: "Europe/Lisbon" });
  const dayNum  = d.toLocaleDateString("pt-PT", { day: "numeric", timeZone: "Europe/Lisbon" });
  const month   = d.toLocaleDateString("pt-PT", { month: "short", timeZone: "Europe/Lisbon" });
  const time    = timeStr ? ` · ${timeStr.slice(0, 5).replace(":", "h")}` : "";
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${dayNum} ${month}${time}`;
}

function fmtPreviewTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) === today) {
    return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
  }
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) === yesterday) return "Ontem";
  const weekday = d.toLocaleDateString("pt-PT", { weekday: "short", timeZone: "Europe/Lisbon" });
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

function previewText(msg: ChatLastMessage | null): string {
  if (!msg) return "Sem mensagens";
  if (msg.is_system) return "Fio criado automaticamente";
  if (msg.card_type === "callup_response") return "Resposta à convocatória";
  if (msg.card_type === "poll") return "📊 Sondagem";
  if (msg.card_type === "transport") return "🚗 Transporte";
  if (msg.card_type === "attendance") return "✅ Presenças";
  if (msg.card_type === "quota_reminder") return "💰 Lembrete de quotas";
  return msg.content.length > 60 ? msg.content.slice(0, 60) + "…" : msg.content;
}

export function EventThreadCard({ thread, active, onClick }: Props) {
  const isGame     = thread.type === "event_game";
  const isArchived = thread.status === "archived";

  // Etiqueta de tipo: "Jogo · sáb 29 ago" / "Treino Técnica · qua 27 ago"
  const typeLabel = isGame
    ? `Jogo${thread.competition ? ` · ${thread.competition}` : ""}`
    : `Treino${(thread as EventTrainingThread).training_kind ? ` · ${KIND_LABEL[(thread as EventTrainingThread).training_kind!] ?? (thread as EventTrainingThread).training_kind}` : ""}`;

  const dateLabel = fmtDate(thread.event_date, thread.event_time);

  // Linha de estado
  const statusLine = isGame
    ? `${(thread as EventGameThread).callup_count}/${(thread as EventGameThread).callup_total} confirmados · ${thread.event_time ? thread.event_time.slice(0, 5).replace(":", "h") : "—"} ${thread.location ? thread.location.split(",")[0] : ""}`
    : `${thread.event_time ? thread.event_time.slice(0, 5).replace(":", "h") + " · " : ""}${thread.location ?? ""}`;

  const past = thread.days_until !== null && thread.days_until < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col gap-1.5 rounded-2xl px-3.5 py-3 text-left transition-all"
      style={{
        background: active
          ? "rgba(249,115,22,.14)"
          : "rgba(169,180,199,.04)",
        border: `1px solid ${active ? "var(--action, #F97316)" : "rgba(169,180,199,.08)"}`,
        opacity: isArchived ? 0.5 : 1,
      }}
    >
      {/* Etiqueta de tipo + data */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: active ? "var(--action, #F97316)" : "#A9B4C7" }}
        >
          {typeLabel} · {dateLabel}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {!past && thread.days_until !== null && thread.days_until <= 7 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(245,158,11,.15)", color: "var(--highlight, #F59E0B)" }}
            >
              {thread.days_until === 0 ? "Hoje" : `${thread.days_until}d`}
            </span>
          )}
          {thread.unread_count > 0 && (
            <span
              className="h-5 min-w-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
              style={{ background: "var(--action, #F97316)", color: "#fff" }}
            >
              {thread.unread_count}
            </span>
          )}
        </div>
      </div>

      {/* Título principal — adversário ou nome do treino */}
      <p
        className="font-condensed font-bold leading-none"
        style={{ fontSize: 18, color: "#E6EBF3" }}
      >
        {thread.event_title}
      </p>

      {/* Linha de estado */}
      {statusLine.trim() && (
        <p className="text-[12px] truncate" style={{ color: "#A9B4C7" }}>{statusLine.trim()}</p>
      )}

      {/* Última mensagem */}
      {thread.last_message && (
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-[11px] truncate" style={{ color: "rgba(169,180,199,.7)" }}>
            {previewText(thread.last_message)}
          </p>
          <span className="shrink-0 text-[10px]" style={{ color: "rgba(169,180,199,.5)" }}>
            {fmtPreviewTime(thread.last_message.created_at)}
          </span>
        </div>
      )}
    </button>
  );
}
