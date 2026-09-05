"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import type { ChatThread } from "@/types/database";

interface Props {
  thread:   ChatThread;
  onSend:   (content: string) => Promise<boolean>;
  onCard:   (type: string, data: Record<string, unknown>) => Promise<boolean>;
  disabled: boolean;
  sending:  boolean;
}

// Etiquetas das pílulas de acção contextuais por tipo de fio
function contextualActions(thread: ChatThread): Array<{ label: string; card: string; emoji: string }> {
  if (thread.type === "event_game") {
    return [
      { label: "Sondagem",  card: "poll",      emoji: "📊" },
      { label: "Transporte", card: "transport", emoji: "🚗" },
    ];
  }
  if (thread.type === "event_training") {
    return [
      { label: "Presenças",  card: "attendance", emoji: "✅" },
      { label: "Sondagem",   card: "poll",       emoji: "📊" },
    ];
  }
  if (thread.type === "staff") {
    return [
      { label: "Lembrete de quotas", card: "quota_reminder", emoji: "💰" },
      { label: "Sondagem",           card: "poll",           emoji: "📊" },
    ];
  }
  if (thread.type === "team" || thread.type === "group") {
    return [{ label: "Sondagem", card: "poll", emoji: "📊" }];
  }
  return [];
}

export function Composer({ thread, onSend, onCard, disabled, sending }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isArchived = thread.status === "archived";
  const actions = contextualActions(thread);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await onSend(content);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Stub para cartões — abre um dialog mínimo (futuro)
  // Por agora, cria um cartão de placeholder com dados mínimos
  async function handleCard(type: string) {
    if (type === "poll") {
      const question = window.prompt("Pergunta da sondagem?");
      if (!question) return;
      const opts = (window.prompt("Opções (separadas por vírgula)") ?? "Sim,Não").split(",").map((o) => o.trim()).filter(Boolean);
      await onCard("poll", {
        question,
        options: opts.map((o, i) => ({ id: String(i), label: o })),
        votes: {},
      });
    } else if (type === "transport") {
      await onCard("transport", {
        driver_name: "Motorista",
        seats_total: 4,
        passengers: [],
      });
    } else if (type === "attendance") {
      await onCard("attendance", {
        training_id: "training_id" in thread ? thread.training_id : "",
        confirmed_count: 0,
        absent_count: 0,
      });
    } else if (type === "quota_reminder") {
      await onCard("quota_reminder", {
        late_count: 0,
        total_owed: 0,
        visible_to: "staff_only",
      });
    }
  }

  if (isArchived) {
    return (
      <div className="px-4 py-3 flex items-center justify-center" style={{ borderTop: "1px solid rgba(169,180,199,.1)" }}>
        <p className="text-[12px] font-medium" style={{ color: "#A9B4C7" }}>
          Fio arquivado · só de leitura
        </p>
      </div>
    );
  }

  return (
    <div className="shrink-0" style={{ borderTop: "1px solid rgba(169,180,199,.1)" }}>
      {/* Pílulas contextuais */}
      {actions.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {actions.map((a) => (
            <button
              key={a.card}
              type="button"
              onClick={() => handleCard(a.card)}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap"
              style={{
                background: "rgba(249,115,22,.1)",
                color: "var(--action, #F97316)",
                border: "1px solid rgba(249,115,22,.2)",
              }}
            >
              <span>{a.emoji}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Campo de texto */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder="Escreve uma mensagem… (Enter para enviar, Shift+Enter para nova linha)"
          disabled={disabled || sending}
          rows={1}
          className="flex-1 resize-none rounded-xl px-4 py-2.5 text-[14px] leading-relaxed outline-none transition-colors"
          style={{
            background: "rgba(169,180,199,.06)",
            border: "1px solid rgba(169,180,199,.12)",
            color: "#E6EBF3",
            minHeight: 44,
            maxHeight: 140,
          }}
          aria-label="Mensagem"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Enviar"
          className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40"
          style={{ background: "var(--action, #F97316)" }}
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </form>
    </div>
  );
}
