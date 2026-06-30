"use client";

import { useEffect, useState } from "react";

export interface AppUser {
  id:         string;
  email:      string;
  name:       string;
  role:       "admin" | "treinador" | "jogador" | "seccionista";
  phone:      string | null;
  birth_date: string | null;
  photo_url:  string | null;
  active:     boolean;
}

export interface LinkedPlayer {
  id:        string;
  name:      string;
  position:  string | null;
  height:    number | null;
  weight:    number | null;
  age:       number | null;
  photo_url: string | null;
  number:    number | null;
  season_id: string;
}

interface CurrentUserData {
  user:    AppUser | null;
  player:  LinkedPlayer | null;
  loading: boolean;
  refresh: () => void;
}

export function useCurrentUser(): CurrentUserData {
  const [user,    setUser]    = useState<AppUser | null>(null);
  const [player,  setPlayer]  = useState<LinkedPlayer | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user   ?? null);
        setPlayer(data.player ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return { user, player, loading, refresh: load };
}
