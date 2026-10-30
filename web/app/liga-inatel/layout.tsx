import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { CompNav } from "@/components/competitions/comp-nav";
import { LigaHeaderButtons } from "@/components/liga/liga-header-buttons";
import { LigaTracker } from "@/components/liga/liga-tracker";
import { LigaPwa } from "@/components/liga/pwa/liga-pwa";

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

// Ecrãs de arranque iOS (largura CSS, altura CSS, densidade)
const IOS_SPLASH: [number, number, number][] = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [414, 896, 3], [414, 896, 2],
  [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2],
];

export const viewport: Viewport = { themeColor: "#15110E" };

// Captura o evento de instalação do Android antes da hidratação do React
// (pode disparar antes de os componentes montarem).
const EARLY_BIP_SCRIPT =
  'window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__ligaBIP=e;window.dispatchEvent(new Event("liga-bip"))});';

export const metadata: Metadata = {
  title: { default: "Liga INATEL", template: "%s · Liga INATEL" },
  description: "Classificação, calendário e resultados da Liga INATEL de basquetebol.",
  openGraph: { siteName: "HoopHub · Liga INATEL", locale: "pt_PT" },
  // App própria "Liga INATEL" quando adicionada ao ecrã principal (diferente do HoopHub):
  // manifest com id/scope /liga-inatel, ícones e título Apple próprios.
  manifest: "/liga-inatel.webmanifest",
  icons: {
    icon: [{ url: "/pwa/liga-inatel-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/pwa/liga-inatel-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Liga INATEL",
    statusBarStyle: "black-translucent",
    startupImage: IOS_SPLASH.map(([w, h, dpr]) => ({
      url: `/pwa/splash/liga-inatel-${w * dpr}x${h * dpr}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
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
      <script dangerouslySetInnerHTML={{ __html: EARLY_BIP_SCRIPT }} />
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
          // App instalada no iPhone (barra de estado translúcida): não ficar por baixo do notch
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            width: "100%",
            margin: "0 auto",
            padding: "0 max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left))",
            display: "flex",
            alignItems: "stretch",
            gap: "16px",
            minHeight: "52px",
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
        /* ── Botão CTA laranja ── */
        .liga-cta-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 4px;
          background: #F97316; color: #15110E;
          text-decoration: none;
          font-family: var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif));
          font-weight: 800; font-size: 12px; letter-spacing: 0.07em;
          text-transform: uppercase; transition: background .15s; white-space: nowrap;
          min-height: 36px;
        }
        .liga-cta-btn:hover { background: #FB8A3C; }
        .liga-cta-compact { padding: 6px 10px; font-size: 11px; }

        /* ── Header layout ── */
        .liga-nav-wrap { flex: 1; overflow: hidden; }
        .liga-desktop-cta { display: flex; align-items: center; gap: 8px; }
        .liga-mobile-bar  { display: none; align-items: center; gap: 4px; flex-shrink: 0; margin-left: auto; }
        .liga-hamburger {
          display: flex; align-items: center; justify-content: center;
          padding: 8px; min-width: 44px; min-height: 44px;
          background: none; border: none; cursor: pointer; flex-shrink: 0;
        }
        .liga-hamburger:focus-visible { outline: 2px solid #F97316; outline-offset: 2px; border-radius: 4px; }

        /* ── Hero grid ── */
        .liga-hero-grid {
          display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: start;
        }
        /* ── Próximo jogo card ── */
        .liga-next-card {
          background: rgba(255,253,250,.06); border: 1px solid rgba(249,115,22,.3);
          border-radius: 8px; overflow: hidden;
          min-width: 220px; max-width: 280px; flex-shrink: 0;
        }
        /* ── Nome de equipa no card (truncado por defeito) ── */
        .liga-next-team-name {
          font-family: var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif));
          font-weight: 700; font-size: 13px; letter-spacing: 0.04em;
          text-transform: uppercase; color: #F6F2EC;
          flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        /* ── Stats row ── */
        .liga-stats-row { display: flex; gap: 32px; flex-wrap: wrap; }
        .liga-stat-value {
          font-family: var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif));
          font-weight: 800; font-size: 32px; color: #F6F2EC;
          line-height: 1; font-variant-numeric: tabular-nums;
        }
        /* ── Grid secções (classificação + próxima jornada) ── */
        .liga-section-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 40px; align-items: start;
        }
        /* ── Localização nos cartões ── */
        .liga-card-location {
          font-family: var(--font-ibm-mono, monospace); font-size: 10px;
          letter-spacing: 0.05em; color: #8C837A;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          text-transform: uppercase;
        }
        /* ── Localização nas linhas de jornada ── */
        .liga-row-location {
          font-family: var(--font-ibm-mono, monospace); font-size: 10px;
          letter-spacing: 0.05em; color: #8C837A; margin-top: 4px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          text-transform: uppercase;
        }

        /* ── Mobile ≤768px ── */
        @media (max-width: 768px) {
          .liga-nav-wrap    { display: none; }
          .liga-desktop-cta { display: none; }
          .liga-mobile-bar  { display: flex; }

          /* Hero empilhado */
          .liga-hero-grid { grid-template-columns: 1fr; gap: 20px; }
          /* Card a 100% */
          .liga-next-card { min-width: 0; max-width: 100%; width: 100%; }
          /* Nomes das equipas podem quebrar */
          .liga-next-team-name {
            white-space: normal; overflow: visible; text-overflow: clip;
            display: -webkit-box; -webkit-line-clamp: 2;
            -webkit-box-orient: vertical; overflow: hidden;
          }
          /* Stats: 3 colunas iguais */
          .liga-stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 8px; }
          .liga-stat-value { font-size: 22px; }
          /* Secções em coluna única */
          .liga-section-grid { grid-template-columns: 1fr; gap: 32px; }
          /* Localizações quebram linha */
          .liga-card-location { white-space: normal; word-break: break-word; }
          .liga-row-location  { white-space: normal; word-break: break-word; }
        }
      `}</style>

      {/* Conteúdo */}
      <LigaTracker />
      <LigaPwa />
      <main style={{ flex: 1 }}>{children}</main>

      {/* Rodapé */}
      <footer
        style={{
          background: "#15110E",
          padding: "24px max(20px, env(safe-area-inset-right)) max(24px, calc(12px + env(safe-area-inset-bottom))) max(20px, env(safe-area-inset-left))",
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
