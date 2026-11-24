"use client";

import { useEffect, useState } from "react";

// Nº de pedidos de acesso pendentes (só para o Master Admin; atualiza a cada 2 min).
export function usePendingAccessRequests(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetch("/api/master/access-requests?summary=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive && j) setCount(Number(j.pending) || 0); })
        .catch(() => {});
    load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, [enabled]);

  return count;
}
