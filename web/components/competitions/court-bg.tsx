import type { CSSProperties, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  minHeight?: string;
}

/** Fundo "pavilhão": escuro com linhas de parquet e círculos decorativos de campo */
export function CourtBg({ children, className, style, minHeight }: Props) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#15110E",
        backgroundImage:
          "repeating-linear-gradient(90deg,rgba(255,255,255,.028) 0 1px,transparent 1px 72px)",
        minHeight,
        ...style,
      }}
    >
      {/* Linhas decorativas de campo — apenas visuais */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Círculo central grande */}
        <div
          style={{
            position: "absolute",
            right: "-140px",
            top: "50%",
            transform: "translateY(-50%)",
            width: 560,
            height: 560,
            borderRadius: "50%",
            border: "2px solid rgba(249,115,22,.28)",
          }}
        />
        {/* Círculo interior */}
        <div
          style={{
            position: "absolute",
            right: "140px",
            top: "50%",
            transform: "translateY(-50%)",
            width: 190,
            height: 190,
            borderRadius: "50%",
            border: "2px solid rgba(249,115,22,.20)",
          }}
        />
        {/* Linha vertical */}
        <div
          style={{
            position: "absolute",
            right: "420px",
            top: 0,
            bottom: 0,
            width: 2,
            background: "rgba(249,115,22,.12)",
          }}
        />
      </div>
      {children}
    </div>
  );
}
