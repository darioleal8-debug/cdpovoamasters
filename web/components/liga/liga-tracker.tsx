"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Regista as páginas vistas na Liga INATEL para as estatísticas do admin.
// Visitante anónimo = id aleatório em localStorage (sem dados pessoais).
// Sessão = id em sessionStorage, renovado após 30 min de inatividade.

const VISITOR_KEY = "hh_liga_vid";
const SESSION_KEY = "hh_liga_sid";
const SESSION_TTL_MS = 30 * 60 * 1000;

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

function sessionId(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const now = Date.now();
    if (raw) {
      const [id, ts] = raw.split("|");
      if (id && now - Number(ts) < SESSION_TTL_MS) {
        sessionStorage.setItem(SESSION_KEY, `${id}|${now}`);
        return id;
      }
    }
    const id = randomId();
    sessionStorage.setItem(SESSION_KEY, `${id}|${now}`);
    return id;
  } catch {
    return randomId();
  }
}

function isStandalone() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function LigaTracker() {
  const pathname = usePathname();
  const current = useRef<{ id: number; start: number; vid: string } | null>(null);
  const firstView = useRef(true);

  useEffect(() => {
    const send = (payload: object) => {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon?.("/api/liga/track", body)) return;
      fetch("/api/liga/track", { method: "POST", body, keepalive: true }).catch(() => {});
    };

    const endCurrent = () => {
      const c = current.current;
      if (!c) return;
      current.current = null;
      send({ type: "end", id: c.id, visitor_id: c.vid, duration_ms: Date.now() - c.start });
    };

    const onHide = () => {
      if (document.visibilityState === "hidden") endCurrent();
    };
    window.addEventListener("pagehide", endCurrent);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", endCurrent);
      document.removeEventListener("visibilitychange", onHide);
      endCurrent();
    };
  }, []);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/liga-inatel/admin")) return;

    const vid = visitorId();
    const start = Date.now();
    const referrer = firstView.current ? document.referrer : "";
    firstView.current = false;
    let cancelled = false;

    fetch("/api/liga/track", {
      method: "POST",
      body: JSON.stringify({
        type: "view",
        visitor_id: vid,
        session_id: sessionId(),
        path: pathname,
        referrer,
        pwa: isStandalone(),
      }),
      keepalive: true,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { id?: number | null } | null) => {
        if (!cancelled && j?.id) current.current = { id: j.id, start, vid };
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      const c = current.current;
      if (c) {
        current.current = null;
        const body = JSON.stringify({ type: "end", id: c.id, visitor_id: c.vid, duration_ms: Date.now() - c.start });
        if (!navigator.sendBeacon?.("/api/liga/track", body)) {
          fetch("/api/liga/track", { method: "POST", body, keepalive: true }).catch(() => {});
        }
      }
    };
  }, [pathname]);

  return null;
}
