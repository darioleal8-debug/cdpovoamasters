"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PLATFORM_LOGO, PLATFORM_THEME as T } from "@/lib/platform-theme";

export function LandingClient() {
  const [headerErr, setHeaderErr] = useState(false);
  const [heroErr,   setHeroErr]   = useState(false);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: T.backgroundGradient }}
    >
      {/* Cabeçalho */}
      <header
        className="flex items-center justify-between px-8 py-5 border-b"
        style={{ borderColor: T.border }}
      >
        {/* Logo header */}
        {!headerErr ? (
          <div className="relative h-8 w-[120px]">
            <Image
              src={PLATFORM_LOGO}
              alt="HoopHub"
              fill
              sizes="120px"
              className="object-contain object-left"
              priority
              onError={() => setHeaderErr(true)}
            />
          </div>
        ) : (
          <span className="text-sm font-bold uppercase tracking-wide" style={{ color: T.text }}>
            HoopHub
          </span>
        )}

        <Link
          href="/login"
          className="rounded-md px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-85"
          style={{ backgroundColor: T.button, color: T.buttonText }}
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Logo hero */}
        <div className="mb-10">
          {!heroErr ? (
            <div className="relative mx-auto h-20 w-[260px]">
              <Image
                src={PLATFORM_LOGO}
                alt="HoopHub"
                fill
                sizes="260px"
                className="object-contain"
                priority
                onError={() => setHeroErr(true)}
              />
            </div>
          ) : (
            <div
              className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl text-2xl font-bold shadow-2xl"
              style={{ backgroundColor: T.button, color: T.buttonText }}
            >
              CDP
            </div>
          )}
        </div>

        <h1
          className="mb-3 text-4xl font-extrabold tracking-tight sm:text-5xl"
          style={{ color: T.text }}
        >
          CD Póvoa Masters
        </h1>
        <p className="mb-2 text-lg" style={{ color: T.textMuted }}>
          Basquetebol · Póvoa de Varzim
        </p>
        <p className="mb-10 max-w-md text-base" style={{ color: T.textMuted }}>
          Plataforma de gestão de jogadores, jogos, pagamentos e estatísticas do clube.
        </p>

        <Link
          href="/login"
          className="rounded-md px-8 py-3 text-base font-semibold shadow-lg transition-opacity hover:opacity-85"
          style={{ backgroundColor: T.button, color: T.buttonText }}
        >
          Aceder ao painel
        </Link>
      </main>

      {/* Rodapé */}
      <footer className="py-6 text-center text-xs" style={{ color: T.textFaint }}>
        © {new Date().getFullYear()} CD Póvoa Masters · Todos os direitos reservados
      </footer>
    </div>
  );
}
