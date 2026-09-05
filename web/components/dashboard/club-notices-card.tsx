"use client";

interface Notice {
  id:      string;
  title:   string;
  body:    string;
  date:    string;
  pinned?: boolean;
}

interface Props {
  notices: Notice[];
  loading?: boolean;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

export function ClubNoticesCard({ notices, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-3 animate-pulse"
        style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>
        <div className="h-3 w-28 rounded-full bg-black/10" />
        {[1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-black/5" />)}
      </div>
    );
  }

  if (!notices || notices.length === 0) return null;

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}>

      <p className="text-[11px] font-bold uppercase tracking-label" style={{ color: "var(--muted-text,#5A6478)" }}>
        Avisos do clube
      </p>

      <ul className="flex flex-col gap-2" role="list">
        {notices.map((n) => (
          <li key={n.id} className="rounded-xl px-3.5 py-3"
            style={{ background: n.pinned ? "rgba(249,115,22,.06)" : "rgba(20,33,61,.04)",
              border: `1px solid ${n.pinned ? "rgba(249,115,22,.18)" : "var(--line,#E4E7EE)"}` }}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--text,#0F1729)" }}>
                {n.pinned && <span className="mr-1.5 text-[10px] uppercase tracking-label font-bold" style={{ color: "var(--action,#F97316)" }}>Fixado ·</span>}
                {n.title}
              </p>
              <span className="shrink-0 text-[11px] whitespace-nowrap" style={{ color: "var(--muted-text,#5A6478)" }}>
                {fmtDate(n.date)}
              </span>
            </div>
            {n.body && (
              <p className="mt-1 text-[12px] leading-relaxed line-clamp-2" style={{ color: "var(--muted-text,#5A6478)" }}>
                {n.body}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
