import type { Metadata } from "next";
import Link from "next/link";
import { getCompetitionBySlug } from "@/lib/competitions-data";

export const metadata: Metadata = {
  title: { default: "Liga INATEL", template: "%s · Liga INATEL" },
  description: "Classificação, calendário e resultados da Liga INATEL de basquetebol — CD Póvoa Masters.",
  openGraph: {
    siteName: "HoopHub · Liga INATEL",
    locale: "pt_PT",
  },
};

const NAV = [
  { href: "/liga-inatel",               label: "Início" },
  { href: "/liga-inatel/classificacao", label: "Classificação" },
  { href: "/liga-inatel/calendario",    label: "Calendário" },
  { href: "/liga-inatel/resultados",    label: "Resultados" },
];

export default async function LigaInatelLayout({ children }: { children: React.ReactNode }) {
  const competition = await getCompetitionBySlug("liga-inatel");

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-3 h-14">
            <Link href="/liga-inatel" className="flex items-center gap-2 shrink-0">
              <span className="text-orange-500 text-lg">🏀</span>
              <span className="font-bold text-sm leading-tight">
                {competition?.short_name ?? "Liga INATEL"}
              </span>
            </Link>
            <span className="text-border">|</span>
            <nav className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto shrink-0">
              <Link
                href="/liga-inatel/resultados/submeter"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors"
              >
                + Resultado
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <p>
          CD Póvoa Masters ·{" "}
          <a href="https://www.hoophub.pt" className="hover:text-foreground transition-colors">
            hoophub.pt
          </a>
        </p>
      </footer>
    </div>
  );
}
