import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Notícias", template: "%s · hoophub" },
  description: "Novidades, regulamentos e atualizações sobre basquetebol de veteranos.",
  openGraph: { siteName: "hoophub", locale: "pt_PT" },
};

const ORANGE = "#F28C28";
const BLACK  = "#111111";
const BORDER = "#E5E7EB";
const GRAY   = "#4B5563";

export default function NoticiasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", flexDirection: "column" }}>
      {/* NavBar */}
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
          height: 64,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span
            style={{
              display: "flex",
              height: 32,
              width: 32,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              background: ORANGE,
              color: "#fff",
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            ◉
          </span>
          <span style={{ fontWeight: 900, fontSize: 18, color: BLACK }}>
            hoop<span style={{ color: ORANGE }}>hub</span>
          </span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <Link href="/noticias" style={{ fontSize: 15, fontWeight: 600, color: BLACK, textDecoration: "none" }}>
            Notícias
          </Link>
          <Link href="/#funcionalidades" style={{ fontSize: 15, fontWeight: 500, color: GRAY, textDecoration: "none" }}>
            Produto
          </Link>
          <Link
            href="/login"
            style={{ fontSize: 15, fontWeight: 600, color: BLACK, textDecoration: "none" }}
          >
            Entrar
          </Link>
        </nav>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: "32px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <span
            style={{
              display: "flex",
              height: 28,
              width: 28,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              background: ORANGE,
              color: "#fff",
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            ◉
          </span>
          <span style={{ fontWeight: 900, fontSize: 16, color: BLACK }}>
            hoop<span style={{ color: ORANGE }}>hub</span>
          </span>
        </Link>
        <p style={{ fontSize: 13, color: "#9CA3AF" }}>
          © {new Date().getFullYear()} hoophub · Gestão de clubes de basquetebol de veteranos
        </p>
      </footer>
    </div>
  );
}
