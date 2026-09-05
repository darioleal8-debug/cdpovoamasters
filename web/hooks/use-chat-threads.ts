"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatThread } from "@/types/database";

export function useChatThreads() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  // Debounce ref: evita recarregamentos em burst (ex.: 5 mensagens seguidas)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadingRef = useRef(false); // evita mostrar skeleton em reloads após carga inicial
  const load = useCallback(async () => {
    // Skeleton só na primeira carga (loadingRef falso enquanto threads já tem dados)
    if (!loadingRef.current) setLoading(true);
    try {
      const res = await fetch("/api/chat/threads", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
        loadingRef.current = true; // primeira carga concluída
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: reagir a novas mensagens e participantes
  // Debounce de 800ms para evitar reloads em burst quando chegam várias mensagens seguidas
  useEffect(() => {
    const supabase = createClient();
    const reload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(load, 800);
    };
    const channel = supabase
      .channel("chat-threads-v2")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, reload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_participants" }, reload)
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Polling de backup — 60s (o Realtime cobre as atualizações em tempo real;
  // o polling serve apenas como safety net se a ligação cair)
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  async function createDirect(targetUserId: string): Promise<string | null> {
    const res = await fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "direct", participant_ids: [targetUserId] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await load();
    return data.chat_id as string;
  }

  async function ensureEventThread(eventId: string): Promise<string | null> {
    const res = await fetch("/api/chat/event-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await load();
    return data.chat_id as string;
  }

  async function ensureTrainingThread(trainingId: string): Promise<string | null> {
    const res = await fetch("/api/chat/event-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ training_id: trainingId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await load();
    return data.chat_id as string;
  }

  return {
    threads,
    loading,
    refresh: load,
    createDirect,
    ensureEventThread,
    ensureTrainingThread,
  };
}
