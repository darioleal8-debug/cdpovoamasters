"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { DaySeparator } from "./system-message";
import type { ChatMessage } from "@/types/database";

type Msg = ChatMessage & { optimistic?: boolean; failed?: boolean };

interface Props {
  messages: Msg[];
  loading:  boolean;
  hasMore:  boolean;
  onLoadOlder: () => void;
  onRetry: (tempId: string, content: string) => void;
}

function dateOf(m: Msg): string {
  return m.created_at.slice(0, 10);
}

function shouldShowSender(messages: Msg[], idx: number): boolean {
  if (idx === 0) return true;
  const prev = messages[idx - 1];
  const curr = messages[idx];
  if (prev.sender_id !== curr.sender_id) return true;
  // Mesmo remetente mas mais de 3 min de diferença
  const diff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
  return diff > 3 * 60_000;
}

export function MessageList({ messages, loading, hasMore, onLoadOlder, onRetry }: Props) {
  const bottomRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showNewBtn, setShowNewBtn] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Scroll para o fundo quando chegam mensagens novas e já estamos no fundo
  useEffect(() => {
    if (isAtBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    else setShowNewBtn(true);
  }, [messages.length]);

  // Scroll inicial para o fundo
  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView();
  }, [loading]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) setShowNewBtn(false);
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowNewBtn(false);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "rgba(249,115,22,.4)", borderTopColor: "transparent" }} />
          <span className="text-[12px]" style={{ color: "#A9B4C7" }}>A carregar…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto py-4"
        style={{ overflowAnchor: "auto" }}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Mensagens"
      >
        {/* Carregar mais antigas */}
        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              type="button"
              onClick={onLoadOlder}
              className="text-[12px] font-medium px-4 py-1.5 rounded-full transition-colors"
              style={{ background: "rgba(169,180,199,.08)", color: "#A9B4C7" }}
            >
              Carregar mensagens anteriores
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-[13px]" style={{ color: "#A9B4C7" }}>Sem mensagens ainda. Começa a conversa!</p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const prevDate = idx > 0 ? dateOf(messages[idx - 1]) : null;
              const currDate = dateOf(msg);
              const showDay  = currDate !== prevDate;
              return (
                <div key={msg.id} aria-label={`${msg.sender_name ?? "Sistema"}: ${msg.content}`}>
                  {showDay && <DaySeparator dateStr={currDate} />}
                  <MessageBubble
                    msg={msg}
                    showSender={shouldShowSender(messages, idx)}
                    onRetry={msg.failed ? (c) => onRetry(msg.id, c) : undefined}
                  />
                </div>
              );
            })}
          </>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Botão novas mensagens */}
      {showNewBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-semibold shadow-lg transition-opacity"
          style={{ background: "var(--action, #F97316)", color: "#ffffff" }}
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Novas mensagens
        </button>
      )}
    </div>
  );
}
