// Ligações de partilha de uma notícia nas redes sociais mais usadas.
// O Instagram não tem ligação de partilha web: o componente copia o link e abre o
// Instagram. A partilha nativa do telemóvel (navigator.share) cobre as restantes apps.

export type ShareNetworkId = "whatsapp" | "facebook" | "x" | "instagram" | "telegram" | "email";

export interface ShareLink {
  id: ShareNetworkId;
  label: string;
  href: string;
  /** Cor da marca (fundo do botão) */
  color: string;
}

export function buildShareLinks(url: string, title: string): ShareLink[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { id: "whatsapp", label: "WhatsApp", color: "#25D366", href: `https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}` },
    { id: "facebook", label: "Facebook", color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "x", label: "X", color: "#000000", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    // O Instagram não tem ligação de partilha web: o botão copia o link e abre o Instagram
    { id: "instagram", label: "Instagram", color: "#DD2A7B", href: "https://www.instagram.com/" },
    { id: "telegram", label: "Telegram", color: "#26A5E4", href: `https://t.me/share/url?url=${u}&text=${t}` },
    { id: "email", label: "E-mail", color: "#6F675F", href: `mailto:?subject=${t}&body=${encodeURIComponent(`${title}\n${url}`)}` },
  ];
}

/** "1 visualização" / "1 234 visualizações" */
export function formatViews(n: number): string {
  const v = Math.max(0, Math.round(n));
  return `${v.toLocaleString("pt-PT")} ${v === 1 ? "visualização" : "visualizações"}`;
}
