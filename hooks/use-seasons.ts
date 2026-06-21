"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Season } from "@/types/database";

export function useSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("seasons")
        .select("*")
        .order("start_date", { ascending: false });

      if (data) {
        setSeasons(data);
        setActiveSeason(data.find((s) => s.status === "ativa") ?? null);
      }
      setLoading(false);
    }
    load();
  }, []);

  return { seasons, activeSeason, loading };
}
