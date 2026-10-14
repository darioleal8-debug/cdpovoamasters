"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Normaliza rotas dinâmicas para evitar ruído no tracking
// ex: /jogos/abc-123/convocatoria → /jogos/[id]/convocatoria
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/[id]")
    .replace(/\/\d{4,}/g, "/[id]");
}

export function useActivityTracker() {
  const pathname   = usePathname();
  const lastSent   = useRef<string | null>(null);

  useEffect(() => {
    const norm = normalizePath(pathname);
    if (norm === lastSent.current) return;
    lastSent.current = norm;

    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "page_view", page: norm }),
    }).catch(() => {});
  }, [pathname]);
}
