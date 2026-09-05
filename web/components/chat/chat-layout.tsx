"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useChatThreads } from "@/hooks/use-chat-threads";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { ThreadList } from "./thread-list";
import { ChatWindow } from "./chat-window";
import { EventPanel } from "./event-panel";
import type { EventGameThread, EventTrainingThread } from "@/types/database";

export function ChatLayout() {
  const { user, loading: userLoading } = useCurrentUser();
  const { threads, loading: threadsLoading, createDirect } = useChatThreads();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showPanel, setShowPanel]       = useState(true);

  const activeThread = threads.find((t) => t.id === activeChatId) ?? null;
  const msgHook      = useChatMessages(activeChatId);

  const isEventThread =
    activeThread?.type === "event_game" || activeThread?.type === "event_training";

  // Não bloqueamos o render inteiro enquanto o utilizador carrega.
  // O chat shell aparece imediatamente; ThreadList mostra o seu próprio skeleton;
  // o painel de mensagens só aparece quando o thread estiver selecionado.

  return (
    /*
     * Mobile (<md):   lista ocupa o ecrã; ao seleccionar, a lista esconde-se
     *                 e o fio ocupa tudo com botão "← Conversas".
     * Tablet (md+):   lista 340px | fio | painel lateral (lg+)
     */
    <div
      className="flex overflow-hidden rounded-2xl"
      style={{ height: "calc(100dvh - var(--header-h, 64px) - 32px)", background: "#0A1220" }}
    >
      {/* ── Lista de fios ───────────────────────────────────────────── */}
      {/* Mobile: visível só quando não há thread seleccionado */}
      <div className={[
        "shrink-0",
        activeChatId ? "hidden md:block" : "block w-full md:w-auto",
      ].join(" ")}>
        <ThreadList
          currentUser={user}
          activeChatId={activeChatId}
          onSelect={(id) => { setActiveChatId(id); setShowPanel(true); }}
          threads={threads}
          loading={threadsLoading || userLoading}
          createDirect={createDirect}
        />
      </div>

      {/* ── Fio de mensagens ────────────────────────────────────────── */}
      {activeThread ? (
        <div className="flex flex-1 flex-col min-w-0">
          {/* Botão "← Conversas" — só mobile */}
          <button
            type="button"
            onClick={() => setActiveChatId(null)}
            className="md:hidden flex items-center gap-2 shrink-0 px-4 py-3 text-[13px] font-semibold"
            style={{
              background: "#0A1220",
              color: "rgba(169,180,199,.7)",
              borderBottom: "1px solid rgba(169,180,199,.08)",
              minHeight: 48,
              touchAction: "manipulation",
            }}
            aria-label="Voltar às conversas"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Conversas
          </button>
          <ChatWindow
            thread={activeThread}
            msgHook={msgHook}
            showPanel={showPanel && isEventThread}
            onTogglePanel={() => setShowPanel((p) => !p)}
          />
        </div>
      ) : (
        /* Estado vazio — só tablet+ (em mobile não aparece, a lista ocupa o ecrã) */
        <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-3 text-center px-6">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(169,180,199,.06)" }}>
            <MessageSquare className="h-6 w-6" style={{ color: "rgba(169,180,199,.3)" }} />
          </div>
          <p className="font-condensed font-bold text-lg uppercase" style={{ color: "rgba(169,180,199,.3)" }}>
            Seleciona uma conversa
          </p>
          <p className="text-[13px]" style={{ color: "rgba(169,180,199,.25)" }}>
            Cada jogo e treino abre um fio automático.
          </p>
        </div>
      )}

      {/* ── Painel direito (só lg+, só jogos/treinos) ───────────────── */}
      {activeThread && isEventThread && showPanel && (
        <div className="hidden lg:flex">
          <EventPanel
            thread={activeThread as EventGameThread | EventTrainingThread}
            onClose={() => setShowPanel(false)}
          />
        </div>
      )}
    </div>
  );
}
