"use client";

import { useState, useEffect } from "react";

type StatBlock = {
  pontos:       number;
  ressaltos:    number;
  assistencias: number;
  jogos:        number;
};

type ApiResponse = {
  season: StatBlock | null;
  last5:  StatBlock | null;
};

type TabKey = "season" | "last5";

const METRICS: { key: keyof StatBlock; label: string }[] = [
  { key: "pontos",       label: "Pontos/Jogo"  },
  { key: "ressaltos",    label: "Ressaltos"     },
  { key: "assistencias", label: "Assistências"  },
  { key: "jogos",        label: "Jogos"         },
];

export function StatsSection({ seasonId }: { seasonId: string | null }) {
  const [tab, setTab]       = useState<TabKey>("season");
  const [data, setData]     = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seasonId) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/player/stats?season_id=${encodeURIComponent(seasonId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d as ApiResponse | null); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [seasonId]);

  const stats: StatBlock | null = tab === "season" ? (data?.season ?? null) : (data?.last5 ?? null);

  function fmt(key: keyof StatBlock, val: number): string {
    if (key === "jogos") return val.toString();
    return val % 1 === 0 ? val.toString() : val.toFixed(1);
  }

  return (
    <div className="bg-card border rounded-xl shadow-sm h-full flex flex-col">
      {/* Header + toggle */}
      <div className="px-4 pt-4 pb-3 border-b flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">As Minhas Estatísticas</span>
        <div className="flex rounded-full border p-0.5 text-xs gap-0.5 bg-muted/40">
          {(["season", "last5"] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-full transition-colors whitespace-nowrap ${
                tab === t
                  ? "bg-foreground text-background font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "season" ? "Esta Época" : "Últimos 5 Jogos"}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 divide-x flex-1 py-5">
        {METRICS.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center justify-center gap-1 px-2">
            <span className="text-2xl font-bold leading-none">
              {loading
                ? "…"
                : stats
                  ? fmt(key, stats[key])
                  : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
