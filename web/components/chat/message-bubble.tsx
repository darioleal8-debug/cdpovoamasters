"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { CardMessage } from "./card-message";
import { SystemMessage } from "./system-message";
import type { ChatMessage, CardType } from "@/types/database";

type Msg = ChatMessage & { optimistic?: boolean; failed?: boolean };

function initials(name: string | null): string {
  if (!name) return "?";
  const p = name.trim().split(" ");
  return p.length > 1 ? `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-PT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
  });
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", treinador: "Treinador", jogador: "Jogador", seccionista: "Seccionista",
};

interface Props {
  msg: Msg;
  showSender: boolean;
  onRetry?: (content: string) => void;
}

export function MessageBubble({ msg, showSender, onRetry }: Props) {
  if (msg.is_system) {
    return <SystemMessage content={msg.content ?? ""} created_at={msg.created_at} />;
  }

  if (msg.is_mine) return <OwnBubble msg={msg} onRetry={onRetry} />;
  return <OtherBubble msg={msg} showSender={showSender} />;
}

// ── Mensagem do utilizador actual ─────────────────────────────
function OwnBubble({ msg, onRetry }: { msg: Msg; onRetry?: (c: string) => void }) {
  return (
    <div className="flex flex-col items-end px-4 py-0.5">
      <div className="max-w-[72%]">
        {msg.card_type ? (
          <div className="mb-1">
            <CardMessage cardType={msg.card_type as CardType} cardData={msg.card_data as Record<string, unknown>} isMine />
          </div>
        ) : (
          <div
            className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-[14px] text-white leading-relaxed"
            style={{
              background: msg.failed ? "rgba(217,45,32,.5)" : "var(--action, #F97316)",
              opacity: msg.optimistic ? 0.75 : 1,
            }}
          >
            {msg.content}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-0.5 px-1">
          {msg.failed ? (
            <button
              type="button"
              onClick={() => onRetry?.(msg.content ?? "")}
              className="flex items-center gap-1 text-[11px] font-medium hover:underline"
              style={{ color: "var(--bad, #D92D20)" }}
            >
              <RotateCcw className="h-3 w-3" />
              Falhou · tentar de novo
            </button>
          ) : msg.optimistic ? (
            <span className="text-[11px]" style={{ color: "#A9B4C7" }}>a enviar…</span>
          ) : (
            <span className="text-[11px]" style={{ color: "#A9B4C7" }}>
              {fmtTime(msg.created_at)}
              {msg.read_by_count > 0 && (
                <> · lido por {msg.read_by_count}</>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mensagem de outro participante ────────────────────────────
function OtherBubble({ msg, showSender }: { msg: Msg; showSender: boolean }) {
  const role = msg.sender_role;
  const roleLabel = role ? ROLE_LABELS[role] : null;

  return (
    <div className="flex items-start gap-3 px-4 py-0.5">
      {/* Avatar */}
      <div
        className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
        style={{ background: "rgba(169,180,199,.15)", color: "#E6EBF3" }}
        aria-hidden="true"
      >
        {initials(msg.sender_name)}
      </div>

      <div className="max-w-[72%]">
        {showSender && (
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[13px] font-semibold" style={{ color: "#E6EBF3" }}>
              {msg.sender_name ?? "Utilizador"}
            </span>
            {roleLabel && (
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(169,180,199,.1)", color: "#A9B4C7" }}
              >
                {roleLabel}
              </span>
            )}
          </div>
        )}

        {msg.card_type ? (
          <CardMessage cardType={msg.card_type as CardType} cardData={msg.card_data as Record<string, unknown>} isMine={false} />
        ) : (
          <div
            className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-[14px] leading-relaxed"
            style={{ background: "#131F36", color: "#E6EBF3" }}
          >
            {msg.content}
          </div>
        )}

        <span className="block mt-0.5 px-1 text-[11px]" style={{ color: "#A9B4C7" }}>
          {fmtTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}
