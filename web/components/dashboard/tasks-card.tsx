"use client";

import Link from "next/link";

interface Task {
  id:           string;
  severity:     "bad" | "warn" | "info";
  title:        string;
  subtitle:     string;
  href:         string;
  action_label: string;
  deadline:     string | null;
  count:        number;
}

interface Props {
  tasks:       Task[];
  tasks_total: number;
  loading?:    boolean;
}

const SEV_COLOR: Record<Task["severity"], string> = {
  bad:  "var(--bad,  #D92D20)",
  warn: "var(--warn, #F59E0B)",
  info: "var(--navy, #14213D)",
};
const SEV_BG: Record<Task["severity"], string> = {
  bad:  "rgba(217,45,32,.08)",
  warn: "rgba(245,158,11,.08)",
  info: "rgba(20,33,61,.06)",
};
const SEV_LABEL: Record<Task["severity"], string> = {
  bad:  "Urgente",
  warn: "Atenção",
  info: "Para tratar",
};

export function TasksCard({ tasks, tasks_total, loading }: Props) {
  if (loading) {
    return (
      <section aria-label="A tratar hoje" className="rounded-2xl p-6 flex flex-col gap-4 animate-pulse"
        style={{ background: "var(--paper, #F6F7F9)", border: "1px solid var(--line, #E4E7EE)" }}>
        <div className="h-4 w-32 rounded-full bg-black/10" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-black/5" />
        ))}
      </section>
    );
  }

  if (tasks.length === 0) {
    return (
      <section aria-label="A tratar hoje" className="rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-center"
        style={{ background: "var(--paper, #F6F7F9)", border: "1px solid var(--line, #E4E7EE)", minHeight: 180 }}>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: "rgba(18,133,91,.1)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 10l4 4 8-8" stroke="var(--ok,#12855B)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="font-semibold text-sm" style={{ color: "var(--text,#0F1729)" }}>Tudo tratado</p>
        <p className="text-[13px]" style={{ color: "var(--muted-text,#5A6478)" }}>Sem tarefas pendentes nesta temporada.</p>
      </section>
    );
  }

  return (
    <section aria-label="A tratar hoje"
      className="rounded-2xl p-6 flex flex-col gap-4"
      style={{ background: "var(--paper, #F6F7F9)", border: "1px solid var(--line, #E4E7EE)" }}>

      <div className="flex items-center justify-between">
        <h2 className="font-condensed font-bold text-lg uppercase tracking-display" style={{ color: "var(--ink,#0A1220)" }}>
          A tratar
        </h2>
        {tasks_total > tasks.length && (
          <span className="text-[12px] font-medium" style={{ color: "var(--muted-text,#5A6478)" }}>
            +{tasks_total - tasks.length} ocultos
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-3" role="list">
        {tasks.map((t) => (
          <li key={t.id}>
            <div
              className="rounded-xl px-4 py-3.5 flex items-start justify-between gap-4"
              style={{ background: SEV_BG[t.severity], border: `1px solid ${SEV_COLOR[t.severity]}22` }}
            >
              <div className="flex items-start gap-3 min-w-0">
                {/* Severity dot */}
                <span
                  aria-label={SEV_LABEL[t.severity]}
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: SEV_COLOR[t.severity] }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text,#0F1729)" }}>
                    {t.title}
                  </p>
                  <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "var(--muted-text,#5A6478)" }}>
                    {t.subtitle}
                  </p>
                </div>
              </div>
              <Link
                href={t.href}
                className="shrink-0 inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold whitespace-nowrap transition-opacity hover:opacity-80"
                style={{ background: SEV_COLOR[t.severity] + "18", color: SEV_COLOR[t.severity] }}
              >
                {t.action_label}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
