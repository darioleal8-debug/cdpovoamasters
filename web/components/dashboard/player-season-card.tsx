"use client";

interface PlayerData {
  games_played:   number;
  avg_points:     number | null;
  attendance_pct: number | null;
  payment_status: string;
}

interface Props {
  data:    PlayerData | null;
  loading?: boolean;
}

const PAY_CONFIG = {
  paid:    { label: "Em dia",    color: "var(--ok,#12855B)",   bg: "rgba(18,133,91,.08)"  },
  late:    { label: "Em atraso", color: "var(--bad,#D92D20)",  bg: "rgba(217,45,32,.08)"  },
  partial: { label: "Parcial",   color: "var(--warn,#F59E0B)", bg: "rgba(245,158,11,.08)" },
  unknown: { label: "—",         color: "var(--muted-text,#5A6478)", bg: "transparent"    },
};

export function PlayerSeasonCard({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-4 animate-pulse"
        style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
        {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-black/5" />)}
      </div>
    );
  }

  if (!data) return null;

  const payConf = PAY_CONFIG[data.payment_status as keyof typeof PAY_CONFIG] ?? PAY_CONFIG.unknown;

  const stats: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Jogos",
      value: String(data.games_played),
    },
    {
      label: "Média pts",
      value: data.avg_points !== null ? String(data.avg_points) : "—",
      sub: "por jogo",
    },
    {
      label: "Presenças",
      value: data.attendance_pct !== null ? `${data.attendance_pct}%` : "—",
      sub: "treinos",
    },
  ];

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>

      <p className="text-[11px] font-bold uppercase tracking-label" style={{ color: "var(--muted-text,#5A6478)" }}>
        A minha época
      </p>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <p className="font-condensed font-bold text-2xl leading-none" style={{ color: "var(--ink,#0A1220)" }}>
              {s.value}
            </p>
            <p className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Estado de quotas */}
      <div
        className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
        style={{ background: payConf.bg, border: `1px solid ${payConf.color}22` }}
      >
        <span className="text-[13px] font-medium" style={{ color: "var(--text,#0F1729)" }}>Quotas</span>
        <span className="text-[13px] font-bold" style={{ color: payConf.color }}>{payConf.label}</span>
      </div>
    </div>
  );
}
