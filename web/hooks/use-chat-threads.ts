"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatThreadSummary } from "@/types/database";

export function useChatThreads() {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chat/threads", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("chat-threads")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_participants" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  async function createGroup(
    name: string,
    participantIds: string[],
    postPolicy: "all" | "admin_only" = "all"
  ): Promise<string | null> {
    const res = await fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "group", name, participant_ids: participantIds, post_policy: postPolicy }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await load();
    return data.chat_id as string;
  }

  async function updatePostPolicy(chatId: string, postPolicy: "all" | "admin_only"): Promise<boolean> {
    const res = await fetch(`/api/chat/threads/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_policy: postPolicy }),
    });
    if (!res.ok) return false;
    await load();
    return true;
  }

  async function deleteThread(chatId: string): Promise<boolean> {
    const res = await fetch(`/api/chat/threads/${chatId}`, { method: "DELETE" });
    if (res.ok) {
      setThreads((prev) => prev.filter((t) => t.id !== chatId));
    }
    return res.ok;
  }

  return { threads, loading, refresh: load, createDirect, createGroup, updatePostPolicy, deleteThread };
}
