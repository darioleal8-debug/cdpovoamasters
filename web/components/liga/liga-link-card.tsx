"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useClubLeague, leagueLinkProps } from "@/hooks/use-club-league";

/**
 * Cartão de acesso ao site/app da liga do clube (Liga INATEL por omissão; outra liga se o
 * clube tiver clubs.league_url). Não aparece se o clube não tiver liga associada.
 * Design da Liga INATEL
 * (fundo escuro #15110E, bola laranja, tipografia condensada pesada).
 * Usado nos dashboards da app de gestão (treinador/admin e jogador).
 * Componente sem estado — pode ser usado em Server e Client Components.
 */
export function LigaLinkCard({ className }: { className?: string }) {
  const { league } = useClubLeague();
  if (!league) return null;
  const isInatel = !league.external;

  return (
    <Link
      href={league.href}
      {...leagueLinkProps(league)}
      aria-label={`Abrir o site da ${league.name}`}
      className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 transition-transform active:scale-[0.99] ${className ?? ""}`}
      style={{
        background: "#15110E",
        border: "1px solid rgba(249,115,22,.35)",
        touchAction: "manipulation",
      }}
    >
      {/* Brilho laranja decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(249,115,22,.28), transparent 70%)" }}
      />

      {/* Bola de basquetebol (igual à do cabeçalho da liga) */}
      <svg width="44" height="44" viewBox="0 0 26 26" fill="none" aria-hidden className="relative shrink-0">
        <circle cx="13" cy="13" r="12" fill="#F97316" />
        <path d="M13 1C13 1 13 25 13 25M1 13C1 13 25 13 25 13" stroke="#15110E" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4.5 4.5C8 8 13 10 18 13C21 14.5 22.5 16 22 19" stroke="#15110E" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        <path d="M4.5 21.5C8 18 13 16 18 13C21 11.5 22.5 10 22 7" stroke="#15110E" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      </svg>

      <div className="relative min-w-0 flex-1">
        <p
          style={{
            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
            fontWeight: 800,
            fontSize: "22px",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            lineHeight: 1,
            color: "#F6F2EC",
          }}
        >
          {isInatel ? <>Liga <span style={{ color: "#F97316" }}>INATEL</span></> : league.name}
        </p>
        <p
          className="mt-1.5 text-[12px] leading-tight"
          style={{ color: "rgba(246,242,236,.6)" }}
        >
          {isInatel ? "Classificação, calendário, resultados e notícias da liga" : "Abrir o site da liga"}
        </p>
      </div>

      <span
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors group-hover:brightness-110"
        style={{ background: "#F97316", color: "#15110E" }}
        aria-hidden
      >
        <ArrowUpRight className="h-5 w-5" />
      </span>
    </Link>
  );
}
