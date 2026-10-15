"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BirthdayMessage } from "@/app/api/birthday-messages/route";
import { getYearLisbon } from "@/lib/birthday-utils";

export type { BirthdayMessage };

interface UseBirthdayMessagesResult {
  messages:       BirthdayMessage[];
  currentUserId:  string | null;
  loading:        boolean;
  sending:        boolean;
  error:          string | null;
  sendMessage:    (text: string, isThankYou?: boolean) => Promise<void>;
  editMessage:    (id: string, text: string) => Promise<void>;
  deleteMessage:  (id: string) => Promise<void>;
  hideMessage:    (id: string, hide: boolean) => Promise<void>;
}

export function useBirthdayMessages(
  playerId: string,
  year: number = getYearLisbon()
): UseBirthdayMessagesResult {
  const [messages,      setMessages]      = useState<BirthdayMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [sending,       setSending]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/birthday-messages?player_id=${playerId}&year=${year}`);
      const json = await res.json() as { messages: BirthdayMessage[]; current_user_id: string };
      if (res.ok) {
        setMessages(json.messages ?? []);
        setCurrentUserId(json.current_user_id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [playerId, year]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`birthday-messages:${playerId}:${year}`)
      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "birthday_messages",
          filter: `celebrant_player_id=eq.${playerId}`,
        },
        () => { load(); } // re-fetch on any change (handles RLS correctly)
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId, year, load]);

  async function sendMessage(text: string, isThankYou = false): Promise<void> {
    setError(null);
    setSending(true);
    // Optimistic: add a placeholder
    const tempId = `temp-${Date.now()}`;
    const optimistic: BirthdayMessage = {
      id:                  tempId,
      celebrant_player_id: playerId,
      celebration_year:    year,
      author_user_id:      currentUserId ?? "",
      author_name:         "Tu",
      author_photo_url:    null,
      message:             text,
      is_thank_you:        isThankYou,
      is_hidden:           false,
      created_at:          new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    };
    setMessages((prev) => {
      // Replace existing own message or add
      const filtered = prev.filter(
        (m) => !(m.author_user_id === currentUserId && m.is_thank_you === isThankYou)
      );
      return isThankYou ? [optimistic, ...filtered] : [...filtered, optimistic];
    });

    try {
      const res = await fetch("/api/birthday-messages", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          celebrant_player_id: playerId,
          celebration_year:    year,
          message:             text,
          is_thank_you:        isThankYou,
        }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? "Erro ao enviar mensagem");
      }
      // Realtime will trigger reload; also reload explicitly to get server data
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem");
      // Rollback optimistic
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  async function editMessage(id: string, text: string): Promise<void> {
    setError(null);
    // Optimistic
    setMessages((prev) =>
      prev.map((m) => m.id === id ? { ...m, message: text, updated_at: new Date().toISOString() } : m)
    );
    try {
      const res = await fetch(`/api/birthday-messages/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? "Erro ao editar");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao editar");
      await load(); // Rollback via reload
    }
  }

  async function deleteMessage(id: string): Promise<void> {
    setError(null);
    // Optimistic
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/birthday-messages/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? "Erro ao apagar");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao apagar");
      await load(); // Rollback
    }
  }

  async function hideMessage(id: string, hide: boolean): Promise<void> {
    setError(null);
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_hidden: hide } : m));
    try {
      const res = await fetch(`/api/birthday-messages/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ is_hidden: hide }),
      });
      if (!res.ok) throw new Error("Erro ao ocultar");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ocultar");
      await load();
    }
  }

  return { messages, currentUserId, loading, sending, error, sendMessage, editMessage, deleteMessage, hideMessage };
}
