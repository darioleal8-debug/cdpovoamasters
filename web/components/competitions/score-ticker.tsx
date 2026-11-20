"use client";

interface Props {
  items: string[]; // ex: ["Jornada 4: CD Póvoa 72–65 BC Barcelos"]
}

/** Faixa laranja com resultados a desfilar continuamente */
export function ScoreTicker({ items }: Props) {
  if (items.length === 0) return null;

  const text = items.join("   ●   ");
  // Duplicar para loop infinito sem corte visual
  const doubled = text + "   ●   " + text;

  return (
    <div
      aria-hidden
      style={{
        background: "#F97316",
        overflow: "hidden",
        height: "36px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <style>{`
        @keyframes liga-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .liga-ticker-inner {
          animation: liga-ticker 38s linear infinite;
          white-space: nowrap;
        }
        @media (prefers-reduced-motion: reduce) {
          .liga-ticker-inner { animation: none; }
        }
      `}</style>
      <span
        className="liga-ticker-inner"
        style={{
          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
          fontWeight: 700,
          fontSize: "13px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#15110E",
          paddingLeft: "24px",
          display: "inline-block",
          // velocidade de leitura constante, independentemente do comprimento do texto
          animationDuration: `${Math.max(30, Math.round(text.length * 0.1))}s`,
        }}
      >
        {doubled}
      </span>
    </div>
  );
}
