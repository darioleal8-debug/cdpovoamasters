import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Equipa", template: "%s · hoophub" },
};

const ORANGE = "#F28C28";
const BLACK  = "#111111";
const BORDER = "#E5E7EB";
const GRAY   = "#4B5563";

export default function EquipaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#fff",
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 60,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span
            style={{
              display: "flex",
              height: 30,
              width: 30,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              background: ORANGE,
              color: "#fff",
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            ◉
          </span>
          <span style={{ fontWeight: 900, fontSize: 17, color: BLACK }}>
            hoop<span style={{ color: ORANGE }}>hub</span>
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link href="/noticias" style={{ fontSize: 14, fontWeight: 500, color: GRAY, textDecoration: "none" }}>
            Notícias
          </Link>
          <Link
            href="/login"
            style={{ fontSize: 14, fontWeight: 600, color: BLACK, textDecoration: "none" }}
          >
            Entrar
          </Link>
        </div>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      <footer
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span
            style={{
              display: "flex",
              height: 26,
              width: 26,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              background: ORANGE,
              color: "#fff",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            ◉
          </span>
          <span style={{ fontWeight: 900, fontSize: 15, color: BLACK }}>
            hoop<span style={{ color: ORANGE }}>hub</span>
          </span>
        </Link>
        <p style={{ fontSize: 13, color: "#9CA3AF" }} suppressHydrationWarning>
          © {new Date().getFullYear()} hoophub · Gestão de clubes de basquetebol de veteranos
        </p>
      </footer>
    </div>
  );
}
