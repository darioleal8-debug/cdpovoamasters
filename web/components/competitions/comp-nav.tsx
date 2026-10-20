"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/liga-inatel",               label: "INÍCIO" },
  { href: "/liga-inatel/classificacao", label: "CLASSIFICAÇÃO" },
  { href: "/liga-inatel/calendario",    label: "CALENDÁRIO" },
  { href: "/liga-inatel/resultados",    label: "RESULTADOS" },
  { href: "/liga-inatel/equipas",       label: "EQUIPAS" },
];

export function CompNav() {
  const path = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: 0,
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {LINKS.map((l) => {
        const active =
          l.href === "/liga-inatel"
            ? path === l.href
            : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            style={{
              display: "inline-flex",
              alignItems: "flex-end",
              padding: "0 14px",
              height: "52px",
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 700,
              fontSize: "13px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: active ? "#F6F2EC" : "#B9AFA4",
              borderBottom: active ? "3px solid #F97316" : "3px solid transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
              transition: "color .15s, border-color .15s",
              paddingBottom: "14px",
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
