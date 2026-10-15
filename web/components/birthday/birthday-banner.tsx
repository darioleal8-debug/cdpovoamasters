"use client";

import { useEffect, useState } from "react";
import type { BirthdayPlayer } from "@/app/api/birthdays/today/route";
import { BirthdayCard } from "./birthday-card";

interface BirthdayBannerProps {
  isAdmin?: boolean;
}

export function BirthdayBanner({ isAdmin = false }: BirthdayBannerProps) {
  const [players, setPlayers] = useState<BirthdayPlayer[]>([]);
  const [loaded,  setLoaded]  = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const simulate = params.get("simulateBirthday");
    const url = simulate
      ? `/api/birthdays/today?simulateBirthday=${encodeURIComponent(simulate)}`
      : "/api/birthdays/today";

    fetch(url)
      .then((r) => r.json())
      .then((json: { players?: BirthdayPlayer[] }) => setPlayers(json.players ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || players.length === 0) return null;

  return (
    <section aria-label="Aniversários de hoje" className="space-y-8">
      {players.map((p) => (
        <BirthdayCard
          key={p.player_id}
          player={p}
          isAdmin={isAdmin}
        />
      ))}
    </section>
  );
}
