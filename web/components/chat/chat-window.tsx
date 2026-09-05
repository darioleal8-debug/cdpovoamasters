"use client";

import { ChevronRight, MapPin, Users, PanelRight } from "lucide-react";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import type { ChatThread, EventGameThread, EventTrainingThread, ChannelThread, DirectThread } from "@/types/database";
import type { useChatMessages } from "@/hooks/use-chat-messages";

type MsgHook = ReturnType<typeof useChatMessages>;

interface Props {
  thread:       ChatThread;
  msgHook:      MsgHook;
  showPanel:    boolean;
  onTogglePanel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  geral: "Geral", tecnica: "Técnica", fisica: "Física",
  tatica: "Tática", jogo: "Jogo interno", mista: "Mista",
};

function fmtLongDate(dateStr: string, timeStr: string | null): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString("pt-PT", { weekday: "long", timeZone: "Europe/Lisbon" });
  const dayNum  = d.toLocaleDateString("pt-PT", { day: "numeric", timeZone: "Europe/Lisbon" });
  const month   = d.toLocaleDateString("pt-PT", { month: "long", timeZone: "Europe/Lisbon" });
  const time    = timeStr ? ` · ${timeStr.slice(0, 5).replace(":", "h")}` : "";
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dayNum} de ${month}${time}`;
}

// ── Header para jogos ─────────────────────────────────────────
function GameHeader({ thread, showPanel, onTogglePanel }: { thread: EventGameThread; showPanel: boolean; onTogglePanel: () => void }) {
  const dateLabel = fmtLongDate(thread.event_date, thread.event_time);
  const location  = thread.location?.split(",")[0] ?? null;
  const total     = thread.callup_total ?? 0;
  const confirmed = thread.callup_count ?? 0;

  return (
    <div
      className="shrink-0 flex items-start justify-between px-5 py-3"
      style={{ borderBottom: "1px solid rgba(169,180,199,.08)", background: "#0A1220" }}
    >
      <div className="min-w-0 flex-1">
        {/* Pré-título */}
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--action,#F97316)" }}>
          Jogo{thread.competition ? ` · ${thread.competition}` : ""}
        </p>

        {/* Confronto em Barlow Condensed */}
        <h1
          className="font-condensed font-bold leading-none truncate"
          style={{ fontSize: 22, color: "#E6EBF3" }}
        >
          {thread.event_title}
        </h1>

        {/* Data + local */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span className="text-[12px]" style={{ color: "#A9B4C7" }}>{dateLabel}</span>
          {location && (
            <span className="flex items-center gap-1 text-[12px]" style={{ color: "#A9B4C7" }}>
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
          {total > 0 && (
            <a
              href={`/jogos/${thread.event_id}`}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: "rgba(249,115,22,.1)", color: "var(--action,#F97316)" }}
            >
              <Users className="h-3 w-3" />
              {confirmed}/{total} convocados
              <ChevronRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Toggle painel lateral */}
      <button
        type="button"
        onClick={onTogglePanel}
        aria-label={showPanel ? "Fechar painel" : "Abrir painel de evento"}
        className="ml-3 h-8 w-8 shrink-0 rounded-xl flex items-center justify-center transition-colors"
        style={{
          background: showPanel ? "rgba(249,115,22,.15)" : "rgba(169,180,199,.06)",
          color: showPanel ? "var(--action,#F97316)" : "#A9B4C7",
        }}
      >
        <PanelRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Header para treinos ───────────────────────────────────────
function TrainingHeader({ thread, showPanel, onTogglePanel }: { thread: EventTrainingThread; showPanel: boolean; onTogglePanel: () => void }) {
  const dateLabel   = fmtLongDate(thread.event_date, thread.event_time);
  const location    = thread.location ?? null;
  const kindLabel   = thread.training_kind ? (KIND_LABEL[thread.training_kind] ?? thread.training_kind) : null;

  return (
    <div
      className="shrink-0 flex items-start justify-between px-5 py-3"
      style={{ borderBottom: "1px solid rgba(169,180,199,.08)", background: "#0A1220" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(169,180,199,.5)" }}>
          Treino{kindLabel ? ` · ${kindLabel}` : ""}
        </p>

        <h1
          className="font-condensed font-bold leading-none truncate"
          style={{ fontSize: 22, color: "#E6EBF3" }}
        >
          {thread.event_title}
        </h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span className="text-[12px]" style={{ color: "#A9B4C7" }}>{dateLabel}</span>
          {location && (
            <span className="flex items-center gap-1 text-[12px]" style={{ color: "#A9B4C7" }}>
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onTogglePanel}
        aria-label={showPanel ? "Fechar painel" : "Abrir painel de treino"}
        className="ml-3 h-8 w-8 shrink-0 rounded-xl flex items-center justify-center transition-colors"
        style={{
          background: showPanel ? "rgba(249,115,22,.15)" : "rgba(169,180,199,.06)",
          color: showPanel ? "var(--action,#F97316)" : "#A9B4C7",
        }}
      >
        <PanelRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Header para canais permanentes ────────────────────────────
function ChannelHeader({ thread, showPanel, onTogglePanel }: { thread: ChannelThread; showPanel: boolean; onTogglePanel: () => void }) {
  const DESCRIPTIONS: Record<string, string> = {
    team:         "Canal de toda a equipa",
    staff:        "Canal da equipa técnica",
    announcement: "Comunicados do clube",
    group:        "Grupo",
  };
  return (
    <div
      className="shrink-0 flex items-center justify-between px-5 py-3"
      style={{ borderBottom: "1px solid rgba(169,180,199,.08)", background: "#0A1220" }}
    >
      <div>
        <h1 className="font-condensed font-bold text-xl" style={{ color: "#E6EBF3" }}>{thread.name}</h1>
        <p className="text-[12px]" style={{ color: "#A9B4C7" }}>{DESCRIPTIONS[thread.type] ?? ""}</p>
      </div>
      <button
        type="button"
        onClick={onTogglePanel}
        className="ml-3 h-8 w-8 shrink-0 rounded-xl flex items-center justify-center transition-colors"
        style={{
          background: showPanel ? "rgba(249,115,22,.15)" : "rgba(169,180,199,.06)",
          color: showPanel ? "var(--action,#F97316)" : "#A9B4C7",
        }}
      >
        <PanelRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Header para diretas ───────────────────────────────────────
function DirectHeader({ thread }: { thread: DirectThread }) {
  function initials(name: string) {
    const p = name.trim().split(" ");
    return p.length > 1 ? `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
  }
  return (
    <div
      className="shrink-0 flex items-center gap-3 px-5 py-3"
      style={{ borderBottom: "1px solid rgba(169,180,199,.08)", background: "#0A1220" }}
    >
      <div className="h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
        style={{ background: "rgba(169,180,199,.12)", color: "#E6EBF3" }}>
        {initials(thread.name)}
      </div>
      <h1 className="font-condensed font-bold text-xl truncate" style={{ color: "#E6EBF3" }}>{thread.name}</h1>
    </div>
  );
}

// ── Header dispatcher ─────────────────────────────────────────
function ThreadHeader({ thread, showPanel, onTogglePanel }: { thread: ChatThread; showPanel: boolean; onTogglePanel: () => void }) {
  if (thread.type === "event_game")     return <GameHeader     thread={thread} showPanel={showPanel} onTogglePanel={onTogglePanel} />;
  if (thread.type === "event_training") return <TrainingHeader thread={thread} showPanel={showPanel} onTogglePanel={onTogglePanel} />;
  if (thread.type === "direct")         return <DirectHeader   thread={thread} />;
  return <ChannelHeader thread={thread as ChannelThread} showPanel={showPanel} onTogglePanel={onTogglePanel} />;
}

// ── ChatWindow ────────────────────────────────────────────────
export function ChatWindow({ thread, msgHook, showPanel, onTogglePanel }: Props) {
  const { messages, loading, hasMore, loadOlder, send, sendCard, retry, sending } = msgHook;

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: "#0A1220" }}>
      <ThreadHeader thread={thread} showPanel={showPanel} onTogglePanel={onTogglePanel} />

      <MessageList
        messages={messages}
        loading={loading}
        hasMore={hasMore}
        onLoadOlder={loadOlder}
        onRetry={retry}
      />

      <Composer
        thread={thread}
        onSend={send}
        onCard={sendCard}
        disabled={false}
        sending={sending}
      />
    </div>
  );
}
