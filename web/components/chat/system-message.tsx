"use client";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-PT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
  });
}

interface Props {
  content: string;
  created_at: string;
}

export function SystemMessage({ content, created_at }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-1" role="status">
      <div className="h-px flex-1" style={{ background: "rgba(169,180,199,.12)" }} />
      <span className="text-[11px] font-medium text-center" style={{ color: "#A9B4C7" }}>
        {content}
        <span className="ml-2 opacity-60">{fmtTime(created_at)}</span>
      </span>
      <div className="h-px flex-1" style={{ background: "rgba(169,180,199,.12)" }} />
    </div>
  );
}

export function DaySeparator({ dateStr }: { dateStr: string }) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  let label: string;
  if (dateStr === today) label = "Hoje";
  else if (dateStr === yesterday) label = "Ontem";
  else {
    label = d.toLocaleDateString("pt-PT", {
      weekday: "long", day: "numeric", month: "long",
      timeZone: "Europe/Lisbon",
    });
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2" role="separator">
      <div className="h-px flex-1" style={{ background: "rgba(169,180,199,.12)" }} />
      <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#A9B4C7" }}>
        {label}
      </span>
      <div className="h-px flex-1" style={{ background: "rgba(169,180,199,.12)" }} />
    </div>
  );
}
