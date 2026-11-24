import Link from "next/link";
import { Megaphone } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { pt } from "date-fns/locale";
import { targetLabel } from "@/lib/announcements/format";
import type { AnnouncementDTO } from "@/lib/announcements/types";

/**
 * Comunicados em destaque no Dashboard (72h, ou até ao final do jogo/treino a que estão afetos).
 * Sem estado nem hooks: serve tanto o Dashboard do clube (cliente) como a área do jogador (servidor).
 */
export function AnnouncementsHighlight({
  items, href, max = 3,
}: { items: AnnouncementDTO[]; href: string; max?: number }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, max);

  return (
    <section
      aria-label="Comunicados em destaque"
      className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3"
      style={{ background: "rgba(249,115,22,.07)", border: "1px solid rgba(249,115,22,.35)", borderLeft: "4px solid var(--action,#F97316)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-label" style={{ color: "var(--action,#F97316)" }}>
          <Megaphone className="h-4 w-4" aria-hidden />
          {items.length === 1 ? "Comunicado" : `Comunicados (${items.length})`}
        </p>
        <Link href={href} className="text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--text,#0A1220)" }}>
          Ver todos
        </Link>
      </div>

      <ul className="flex flex-col gap-3" role="list">
        {shown.map((a) => (
          <li key={a.id} className="flex flex-col gap-1">
            {a.target && (
              <span
                className="self-start rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "rgba(20,33,61,.08)", color: "var(--text,#0A1220)" }}
              >
                {targetLabel(a.target)}
              </span>
            )}
            <p className="text-[15px] font-bold leading-snug" style={{ color: "var(--text,#0A1220)" }}>{a.title}</p>
            <p className="whitespace-pre-line text-[13px] leading-relaxed line-clamp-4" style={{ color: "var(--text,#0A1220)" }}>
              {a.body}
            </p>
            <p className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>
              {a.author?.name ?? "Equipa"} · há {formatDistanceToNowStrict(new Date(a.created_at), { locale: pt })}
            </p>
          </li>
        ))}
      </ul>

      {items.length > shown.length && (
        <Link href={href} className="text-[12px] font-semibold" style={{ color: "var(--text,#0A1220)" }}>
          + {items.length - shown.length} em destaque
        </Link>
      )}
    </section>
  );
}
