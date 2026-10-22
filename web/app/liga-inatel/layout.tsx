import type { Metadata } from "next";
import Link from "next/link";
import { Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { CompNav } from "@/components/competitions/comp-nav";
import { LigaHeaderButtons } from "@/components/liga/liga-header-buttons";

// Peso 800 (não carregado no root layout)
const bcHeavy = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-bc-heavy",
  display: "swap",
});

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-ibm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Liga INATEL", template: "%s · Liga INATEL" },
  description: "Classificação, calendário e resultados da Liga INATEL de basquetebol.",
  openGraph: { siteName: "HoopHub · Liga INATEL", locale: "pt_PT" },
};

export default function LigaInatelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${bcHeavy.variable} ${ibmMono.variable} liga-inatel-root`}
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#F4EFE8",
        color: "#1A1612",
        fontFamily: "var(--font-barlow, sans-serif)",
      }}
    >
      {/* Header fixo */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#15110E",
          borderBottom: "1px solid rgba(249,115,22,.25)",
          display: "flex",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            width: "100%",
            margin: "0 auto",
            padding: "0 20px",
            display: "flex",
            alignItems: "stretch",
            gap: "16px",
          }}
        >
          {/* Logo */}
          <Link
            href="/liga-inatel"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              textDecoration: "none",
              paddingRight: "16px",
              borderRight: "1px solid rgba(249,115,22,.2)",
              flexShrink: 0,
            }}
          >
            {/* Bola de basquetebol SVG */}
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
              <circle cx="13" cy="13" r="12" fill="#F97316" />
              <path
                d="M13 1C13 1 13 25 13 25M1 13C1 13 25 13 25 13"
                stroke="#15110E" strokeWidth="1.5" strokeLinecap="round"
              />
              <path
                d="M4.5 4.5C8 8 13 10 18 13C21 14.5 22.5 16 22 19"
                stroke="#15110E" strokeWidth="1" strokeLinecap="round"
                opacity="0.7"
              />
              <path
                d="M4.5 21.5C8 18 13 16 18 13C21 11.5 22.5 10 22 7"
                stroke="#15110E" strokeWidth="1" strokeLinecap="round"
                opacity="0.7"
              />
            </svg>
            <span
              style={{
                fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                fontWeight: 800,
                fontSize: "16px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#F6F2EC",
                lineHeight: 1,
              }}
            >
              INATEL
            </span>
          </Link>

          {/* Nav */}
          <div className="liga-nav-wrap">
            <CompNav />
          </div>

          {/* CTAs + hamburger (client, session-aware) */}
          <LigaHeaderButtons />
        </div>
      </header>

      <style>{`
        .liga-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 4px;
          background: #F97316;
          color: #15110E;
          text-decoration: none;
          font-family: var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif));
          font-weight: 800;
          font-size: 12px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          transition: background .15s;
          white-space: nowrap;
        }
        .liga-cta-btn:hover { background: #FB8A3C; }
        .liga-nav-wrap { flex: 1; overflow: hidden; }
        .liga-desktop-cta { display: flex; align-items: center; gap: 8px; }
        .liga-hamburger {
          display: none;
          align-items: center;
          padding: 4px;
          background: none;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }
        .liga-hamburger:focus-visible {
          outline: 2px solid #F97316;
          outline-offset: 2px;
          border-radius: 4px;
        }
        @media (max-width: 640px) {
          .liga-nav-wrap { display: none; }
          .liga-desktop-cta { display: none; }
          .liga-hamburger { display: flex; }
        }
      `}</style>

      {/* Conteúdo */}
      <main style={{ flex: 1 }}>{children}</main>

      {/* Rodapé */}
      <footer
        style={{
          background: "#15110E",
          padding: "24px 20px",
          textAlign: "center",
          fontFamily: "var(--font-ibm-mono, monospace)",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#6F675F",
        }}
      >
        <p>
          Liga INATEL de basquetebol ·{" "}
          <a
            href="https://www.hoophub.pt"
            style={{ color: "#F97316", textDecoration: "none" }}
          >
            hoophub.pt
          </a>
        </p>
      </footer>
    </div>
  );
}
