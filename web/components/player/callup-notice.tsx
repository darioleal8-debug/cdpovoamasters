import Link from "next/link";
import { Megaphone } from "lucide-react";

// Aviso de convocatória mostrado ao jogador no Dashboard (Minha Área) e na
// view do jogo. Server-safe (sem estado) — pode ser usado em server e client
// components.

const PT_DAYS   = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtWhen(date: string, time: string | null): string {
  const d = new Date(date + "T00:00:00");
  const base = `${PT_DAYS[d.getDay()]}, ${d.getDate()} ${PT_MONTHS[d.getMonth()]}`;
  return time ? `${base} · ${time.slice(0, 5)}h` : base;
}

export function CallupNotice({
  gameTitle,
  eventDate,
  eventTime,
  location,
  href,
}: {
  /** Ex.: "vs A Portuguesa de Leça FC" */
  gameTitle: string;
  eventDate: string;
  eventTime: string | null;
  location: string | null;
  /** Link para a view do jogo; omitir quando já estamos nela. */
  href?: string;
}) {
  const when = fmtWhen(eventDate, eventTime);

  return (
    <div
      role="status"
      style={{
        borderRadius: "8px",
        background: "linear-gradient(135deg, #F97316 0%, #C2530A 100%)",
        boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(194,83,10,.6)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        color: "#fff",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          background: "rgba(255,255,255,.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Megaphone size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: "var(--font-barlow-condensed, sans-serif)",
            fontWeight: 800,
            fontSize: "18px",
            letterSpacing: ".05em",
            textTransform: "uppercase",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          Estás convocado!
        </p>
        <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "14px", margin: "3px 0 0", opacity: 0.95 }}>
          {gameTitle} · {when}
          {location ? ` · ${location}` : ""}
        </p>
      </div>
      {href && (
        <Link
          href={href}
          style={{
            flexShrink: 0,
            borderRadius: "6px",
            background: "#fff",
            color: "#C2530A",
            fontFamily: "var(--font-barlow, sans-serif)",
            fontSize: "12px",
            fontWeight: 700,
            padding: "8px 12px",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Ver jogo →
        </Link>
      )}
    </div>
  );
}
