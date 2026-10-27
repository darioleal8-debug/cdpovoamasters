"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface PendingState {
  training: boolean;
  game: boolean;
}

interface PlayerPendingContextValue extends PendingState {
  update: (next: Partial<PendingState>) => void;
}

const PlayerPendingContext = createContext<PlayerPendingContextValue>({
  training: false,
  game: false,
  update: () => {},
});

export function PlayerPendingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PendingState>({ training: false, game: false });

  const update = useCallback((next: Partial<PendingState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  return (
    <PlayerPendingContext.Provider value={{ ...state, update }}>
      {children}
    </PlayerPendingContext.Provider>
  );
}

export function usePlayerPending() {
  return useContext(PlayerPendingContext);
}
