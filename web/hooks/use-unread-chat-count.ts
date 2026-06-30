"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export function useUnreadChatCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread-count", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCount(data.unread_count ?? 0);
      }
    } catch {
      // Silencioso — badge simplesmente não atualiza nesta tentativa.
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("chat-unread-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_participants" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return count;
}
