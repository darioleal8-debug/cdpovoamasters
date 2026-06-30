"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatThreadMessage } from "@/types/database";

export function useChatMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/threads/${chatId}/messages?limit=50`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
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
    const before = messages[0].created_at;
    const res = await fetch(`/api/chat/threads/${chatId}/messages?limit=50&before=${encodeURIComponent(before)}`);
    if (res.ok) {
      const data = await res.json();
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMore(data.has_more ?? false);
    }
  }

  async function send(content: string) {
    if (!chatId || !content.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chat/threads/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Falha ao enviar mensagem (HTTP ${res.status})`);
      }
      const { message } = await res.json();
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } finally {
      setSending(false);
    }
  }

  async function markRead() {
    if (!chatId) return;
    await fetch(`/api/chat/threads/${chatId}/read`, { method: "POST" });
  }

  useEffect(() => {
    if (!chatId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-messages-${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => {
            const incoming = payload.new as Record<string, unknown>;
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [
              ...prev,
              {
                id: incoming.id as string,
                chat_id: incoming.chat_id as string,
                sender_id: incoming.sender_id as string | null,
                sender_name: null,
                content: incoming.content as string,
                attachment_url: incoming.attachment_url as string | null,
                created_at: incoming.created_at as string,
              },
            ];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  return { messages, loading, hasMore, sending, send, loadOlder, markRead, refresh: load };
}
