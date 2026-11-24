"use client";

import { useEffect, useState } from "react";

// Singleton: o hook é usado em várias barras de navegação ao mesmo tempo (Sidebar, TabRail, BottomNav…);
// um único pedido/temporizador serve todas e os componentes registam-se como listeners.

type Listener = (count: number) => void;

let _count = 0;
let _started = false;
const _listeners = new Set<Listener>();
const POLL_MS = 60_000;

/** Disparado depois de ler/publicar/apagar comunicados para atualizar o badge de imediato. */
export const ANNOUNCEMENTS_CHANGED = "announcements:changed";

function _dispatch(count: number) {
  _count = count;
  _listeners.forEach((fn) => fn(count));
}

async function _load() {
  try {
    const res = await fetch("/api/announcements/unread-count", { cache: "no-store" });
    if (res.ok) {
      const { unread_count } = await res.json();
      _dispatch(unread_count ?? 0);
    }
  } catch { /* silencioso — o badge fica no valor anterior */ }
}

function _start() {
  if (_started) return;
  _started = true;
  window.addEventListener(ANNOUNCEMENTS_CHANGED, _load);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void _load(); });
  setInterval(() => { if (document.visibilityState === "visible") void _load(); }, POLL_MS);
  void _load();
}

export function useUnreadAnnouncements(): number {
  const [count, setCount] = useState(() => _count);
  useEffect(() => {
    _listeners.add(setCount);
    _start();
    setCount(_count);
    return () => { _listeners.delete(setCount); };
  }, []);
  return count;
}
