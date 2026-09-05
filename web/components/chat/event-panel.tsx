"use client";

import { useEffect, useState } from "react";
import { X, Check, HelpCircle, XCircle, Clock, MapPin, ExternalLink } from "lucide-react";
import type { EventGameThread, EventTrainingThread } from "@/types/database";

type EventThread = EventGameThread | EventTrainingThread;

interface CallupPlayer {
  id: string;
  name: string;
  position: string | null;
  photo_url: string | null;
  status: "confirmado" | "duvida" | "indisponivel" | "pendente";
}

interface PanelData {
  players: CallupPlayer[];
}

interface Props {
  thread:  EventThread;
  onClose: () => void;
}

// ── Sub-componentes ───────────────────────────────────────────

function StatusIcon({ status }: { status: CallupPlayer["status"] }) {
  if (status === "confirmado")   return <Check   className="h-3.5 w-3.5" style={{ color: "#22C55E" }} />;
  if (status === "duvida")       return <HelpCircle className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} />;
  if (status === "indisponivel") return <XCircle  className="h-3.5 w-3.5" style={{ color: "#EF4444" }} />;
  return <Clock className="h-3.5 w-3.5" style={{ color: "rgba(169,180,199,.4)" }} />;
}

const STATUS_LABEL: Record<CallupPlayer["status"], string> = {
  confirmado:   "Confirmado",
  duvida:       "Em dúvida",
  indisponivel: "Indisponível",
  pendente:     "Sem resposta",
};

function PlayerRow({ player }: { player: CallupPlayer }) {
  function initials(name: string): string {
    const p = name.trim().split(" ");
    return p.length > 1 ? `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
  }

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {player.photo_url ? (
        <img
          src={player.photo_url}
          alt={player.name}
          className="h-7 w-7 rounded-full object-cover shrink-0"
        />
      ) : (
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: "rgba(169,180,199,.12)", color: "#E6EBF3" }}
        >
          {initials(player.name)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium truncate" style={{ color: "#E6EBF3" }}>{player.name}</p>
        {player.position && (
          <p className="text-[10px] truncate" style={{ color: "rgba(169,180,199,.5)" }}>{player.position}</p>
        )}
      </div>
      <StatusIcon status={player.status} />
    </div>
  );
}

// ── Secção de métricas de convocatória ────────────────────────
function CallupMetrics({ confirmed, doubt, unavailable, pending }: { confirmed: number; doubt: number; unavailable: number; pending: number }) {
  const total = confirmed + doubt + unavailable + pending;
  if (total === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 mb-4">
      {[
        { label: "Confirmados",   count: confirmed,   color: "#22C55E", bg: "rgba(34,197,94,.1)" },
        { label: "Em dúvida",     count: doubt,       color: "#F59E0B", bg: "rgba(245,158,11,.1)" },
        { label: "Indisponíveis", count: unavailable, color: "#EF4444", bg: "rgba(239,68,68,.1)" },
        { label: "Sem resposta",  count: pending,     color: "rgba(169,180,199,.5)", bg: "rgba(169,180,199,.06)" },
      ].map(({ label, count, color, bg }) => (
        <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: bg }}>
          <p className="text-[22px] font-bold font-condensed" style={{ color }}>{count}</p>
          <p className="text-[10px] font-medium" style={{ color: "rgba(169,180,199,.7)" }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────
export function EventPanel({ thread, onClose }: Props) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const isGame = thread.type === "event_game";

  const eventId    = isGame ? (thread as EventGameThread).event_id : null;
  const trainingId = !isGame ? (thread as EventTrainingThread).training_id : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    async function load() {
      try {
        const param = isGame
          ? `event_id=${eventId}`
          : `training_id=${trainingId}`;
        const res = await fetch(`/api/chat/event-panel?${param}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (eventId || trainingId) load();
    else setLoading(false);

    return () => { cancelled = true; };
  }, [eventId, trainingId, isGame]);

  const players = data?.players ?? [];
  const confirmed   = players.filter((p) => p.status === "confirmado").length;
  const doubt       = players.filter((p) => p.status === "duvida").length;
  const unavailable = players.filter((p) => p.status === "indisponivel").length;
  const pending     = players.filter((p) => p.status === "pendente").length;

  const groupedPlayers: Record<CallupPlayer["status"], CallupPlayer[]> = {
    confirmado:   players.filter((p) => p.status === "confirmado"),
    duvida:       players.filter((p) => p.status === "duvida"),
    indisponivel: players.filter((p) => p.status === "indisponivel"),
    pendente:     players.filter((p) => p.status === "pendente"),
  };

  const isGameThread = thread as EventGameThread;
  const location = thread.location ?? null;
  const detailsUrl = isGame
    ? `/jogos/${eventId}`
    : `/treinos`;

  return (
    <div
      className="flex h-full w-[280px] shrink-0 flex-col"
      style={{ background: "#0D1729", borderLeft: "1px solid rgba(169,180,199,.08)" }}
    >
      {/* Header do painel */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(169,180,199,.08)" }}>
        <p className="text-[12px] font-bold uppercase tracking-widest" style={{ color: "rgba(169,180,199,.5)" }}>
          {isGame ? "Convocatória" : "Presenças"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:opacity-70"
          style={{ color: "#A9B4C7" }}
          aria-label="Fechar painel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conteúdo com scroll */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 rounded-lg animate-pulse" style={{ background: "rgba(169,180,199,.06)" }} />
            ))}
          </div>
        ) : (
          <>
            {/* Logística */}
            {(thread.event_time || location) && (
              <div className="mb-4 rounded-xl p-3" style={{ background: "rgba(169,180,199,.04)", border: "1px solid rgba(169,180,199,.08)" }}>
                {thread.event_time && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(169,180,199,.5)" }} />
                    <span className="text-[13px]" style={{ color: "#E6EBF3" }}>
                      {thread.event_time.slice(0, 5).replace(":", "h")}
                    </span>
                  </div>
                )}
                {location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(169,180,199,.5)" }} />
                    <span className="text-[13px]" style={{ color: "#E6EBF3" }}>{location}</span>
                  </div>
                )}
              </div>
            )}

            {/* Métricas de convocatória (só jogos) */}
            {isGame && (
              <CallupMetrics confirmed={confirmed} doubt={doubt} unavailable={unavailable} pending={pending} />
            )}

            {/* Lista de jogadores agrupada */}
            {isGame && players.length > 0 && (
              <>
                {(["confirmado", "duvida", "indisponivel", "pendente"] as CallupPlayer["status"][]).map((status) => {
                  const group = groupedPlayers[status];
                  if (group.length === 0) return null;
                  return (
                    <div key={status} className="mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                        style={{ color: "rgba(169,180,199,.4)" }}>
                        {STATUS_LABEL[status]} ({group.length})
                      </p>
                      {group.map((p) => <PlayerRow key={p.id} player={p} />)}
                    </div>
                  );
                })}
              </>
            )}

            {/* Treino: lista de presentes */}
            {!isGame && players.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: "rgba(169,180,199,.4)" }}>
                  Jogadores ({players.length})
                </p>
                {players.map((p) => <PlayerRow key={p.id} player={p} />)}
              </div>
            )}

            {players.length === 0 && !loading && (
              <p className="text-[12px] text-center py-8" style={{ color: "rgba(169,180,199,.4)" }}>
                {isGame ? "Nenhum jogador convocado" : "Sem presenças registadas"}
              </p>
            )}

            {/* Link para ficha completa */}
            <a
              href={detailsUrl}
              className="flex items-center justify-center gap-1.5 mt-4 h-9 w-full rounded-xl text-[12px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: "rgba(249,115,22,.08)", color: "var(--action,#F97316)" }}
            >
              {isGame ? "Ficha do jogo" : "Ver treino"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
