"use client";

import { useState, useEffect } from "react";

export type LiveLayout = "a" | "b" | "c";
export interface LivePrefs { layout: LiveLayout; dark: boolean; fullscreen: boolean; }

const KEY = "stats-live-prefs";
const DEFAULTS: LivePrefs = { layout: "a", dark: false, fullscreen: false };

export function useLivePrefs() {
  const [prefs, setPrefs] = useState<LivePrefs>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  function update(patch: Partial<LivePrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  return {
    prefs,
    setLayout: (l: LiveLayout) => update({ layout: l }),
    setDark: (d: boolean) => update({ dark: d }),
    setFullscreen: (f: boolean) => update({ fullscreen: f }),
  };
}
