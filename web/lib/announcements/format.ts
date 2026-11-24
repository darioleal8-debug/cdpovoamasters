import type { AnnouncementTarget } from "./types";

/** "sáb., 28 de nov." a partir de YYYY-MM-DD (data civil; sem conversões de fuso). */
export function formatCivilDate(date: string): string {
  return new Intl.DateTimeFormat("pt-PT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

/** "Jogo · vs Porto · sáb., 28 de nov. · 21:00" / "Treino · ter., 24 de nov. · 21:00" */
export function targetLabel(t: AnnouncementTarget): string {
  const when = [formatCivilDate(t.date), t.time ? t.time.slice(0, 5) : null].filter(Boolean).join(" · ");
  if (t.kind === "game") {
    const vs = t.opponent ? `vs ${t.opponent}` : t.title;
    return `Jogo · ${vs} · ${when}`;
  }
  return `Treino · ${when}`;
}

/** Resumo curto para a notificação push (sem quebras de linha). */
export function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
