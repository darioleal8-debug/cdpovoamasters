"use client";

// SVG de camisola (tank top) + calção de basquetebol

function JerseySvg({ color }: { color: string }) {
  const border = "rgba(0,0,0,0.15)";
  return (
    <svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" className="h-full w-auto drop-shadow-sm">
      {/* Corpo */}
      <path
        d="M15 5 L8 18 L16 22 L16 74 L44 74 L44 22 L52 18 L45 5 Q38 14 30 12 Q22 14 15 5 Z"
        fill={color}
        stroke={border}
        strokeWidth="1.2"
      />
      {/* Sombreado sutil no centro para dar volume */}
      <path
        d="M30 12 Q28 30 28 74"
        fill="none"
        stroke="rgba(0,0,0,0.07)"
        strokeWidth="2"
      />
      {/* Linha decorativa no pescoço */}
      <path
        d="M22 10 Q30 18 38 10"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShortsSvg({ color }: { color: string }) {
  const border = "rgba(0,0,0,0.15)";
  return (
    <svg viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg" className="h-full w-auto drop-shadow-sm">
      {/* Calção */}
      <path
        d="M6 4 L54 4 L48 46 L34 46 L30 26 L26 46 L12 46 Z"
        fill={color}
        stroke={border}
        strokeWidth="1.2"
      />
      {/* Linha divisória central */}
      <line x1="30" y1="4" x2="30" y2="26" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
    </svg>
  );
}

interface KitSetProps {
  label:        string;
  jerseyColor:  string;
  shortsColor:  string;
}

function KitSet({ label, jerseyColor, shortsColor }: KitSetProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="flex items-end gap-2">
        <div className="h-20">
          <JerseySvg color={jerseyColor} />
        </div>
        <div className="h-12">
          <ShortsSvg color={shortsColor} />
        </div>
      </div>
      <div className="flex gap-1">
        <span
          className="h-3 w-6 rounded-sm border border-black/10 shadow-sm"
          style={{ backgroundColor: jerseyColor }}
          title={jerseyColor}
        />
        <span
          className="h-3 w-6 rounded-sm border border-black/10 shadow-sm"
          style={{ backgroundColor: shortsColor }}
          title={shortsColor}
        />
      </div>
    </div>
  );
}

interface KitPreviewProps {
  jerseyHomeColor: string;
  shortsHomeColor: string;
  jerseyAwayColor: string;
  shortsAwayColor: string;
  className?:      string;
}

export function KitPreview({
  jerseyHomeColor, shortsHomeColor,
  jerseyAwayColor, shortsAwayColor,
  className = "",
}: KitPreviewProps) {
  return (
    <div className={`flex items-start justify-center gap-8 rounded-xl border bg-gradient-to-b from-muted/60 to-muted/20 p-5 ${className}`}>
      <KitSet label="Casa"  jerseyColor={jerseyHomeColor} shortsColor={shortsHomeColor} />
      <div className="self-center text-muted-foreground/40 text-2xl font-light select-none">·</div>
      <KitSet label="Fora"  jerseyColor={jerseyAwayColor} shortsColor={shortsAwayColor} />
    </div>
  );
}

// Micro swatches para uso em tabelas/listas (ex: ao lado do nome da equipa nos jogos)
interface KitSwatchProps {
  jerseyColor: string;
  shortsColor: string;
  size?: "xs" | "sm";
  title?: string;
}

export function KitSwatch({ jerseyColor, shortsColor, size = "xs", title }: KitSwatchProps) {
  const sz = size === "xs" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" title={title}>
      <span className={`${sz} rounded-full border border-black/10 inline-block`} style={{ backgroundColor: jerseyColor }} />
      <span className={`${sz} rounded-full border border-black/10 inline-block`} style={{ backgroundColor: shortsColor }} />
    </span>
  );
}
