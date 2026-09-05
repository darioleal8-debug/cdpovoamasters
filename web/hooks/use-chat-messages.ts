"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, CardType } from "@/types/database";

type OptimisticMessage = ChatMessage & { optimistic?: true; failed?: true };

export function useChatMessages(chatId: string | null) {
  const [messages, setMessages]   = useState<OptimisticMessage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [hasMore, setHasMore]     = useState(false);
  const [sending, setSending]     = useState(false);
  const tempCounter = useRef(0);

  const load = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/threads/${chatId}/messages?limit=50`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        // Substituir tudo — remove otimistas resolvidos
        setMessages(data.messages ?? []);
        setHasMore(data.has_more ?? false);
      }
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    setMessages([]);
    load();
  }, [chatId, load]);

  async function loadOlder() {
    if (!chatId || messages.length === 0) return;
    const oldest = messages.find((m) => !m.optimistic);
    if (!oldest) return;
    const res = await fetch(
      `/api/chat/threads/${chatId}/messages?limit=50&before=${encodeURIComponent(oldest.created_at)}`
    );
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMore(data.has_more ?? false);
    }
  }

  async function send(content: string): Promise<boolean> {
    if (!chatId || !content.trim()) return false;

    // Envio otimista
    const tempId = `temp-${++tempCounter.current}`;
    const optimistic: OptimisticMessage = {
      id: tempId, chat_id: chatId,
      sender_id: null, sender_name: null, sender_role: null,
      content: content.trim(), card_type: null, card_data: null,
      is_system: false, attachment_url: null,
      created_at: new Date().toISOString(),
      read_by_count: 0, is_mine: true,
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);

    try {
      const res = await fetch(`/api/chat/threads/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!res.ok) {
        // Marcar como falhada
        setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, failed: true } : m));
        return false;
      }

      const { message } = await res.json();
      // Substituir otimista pela real
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...message, is_mine: true } : m));
      return true;
    } catch {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, failed: true } : m));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function retry(tempId: string, content: string): Promise<void> {
    // Remover mensagem falhada e tentar de novo
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
    await send(content);
  }

  async function sendCard(cardType: string, cardData: Record<string, unknown>, content?: string): Promise<boolean> {
    if (!chatId) return false;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/threads/${chatId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_type: cardType, card_data: cardData, content }),
      });
      if (!res.ok) return false;
      const { message } = await res.json();
      setMessages((prev) => [...prev, { ...message, is_mine: true }]);
      return true;
    } finally {
      setSending(false);
    }
  }

  async function markRead() {
    if (!chatId) return;
    await fetch(`/api/chat/threads/${chatId}/read`, { method: "POST" }).catch(() => {});
  }

  // Realtime: novas mensagens de outros
  useEffect(() => {
    if (!chatId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages-${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const incoming = payload.new as Record<string, unknown>;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [
              ...prev,
              {
                id:             incoming.id as string,
                chat_id:        incoming.chat_id as string,
                sender_id:      incoming.sender_id as string | null,
                sender_name:    null,
                sender_role:    incoming.sender_role as string | null,
                content:        incoming.content as string | null,
                card_type:      (incoming.card_type as CardType | null) ?? null,
                card_data:      incoming.card_data ?? null,
                is_system:      (incoming.is_system as boolean) ?? false,
                attachment_url: incoming.attachment_url as string | null,
                created_at:     incoming.created_at as string,
                read_by_count:  0,
                is_mine:        false,
              },
            ];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  // Polling de backup (30s) — o Realtime postgres_changes é o mecanismo principal;
  // o polling serve apenas como fallback se a ligação WebSocket cair.
  useEffect(() => {
    if (!chatId) return;
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 30_000);
    return () => clearInterval(id);
  }, [chatId, load]);

  return {
    messages, loading, hasMore, sending,
    send, retry, sendCard, loadOlder, markRead,
    refresh: load,
  };
}
