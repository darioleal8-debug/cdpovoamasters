"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlayerSidebar } from "./player-sidebar";
import { PlayerBottomNav } from "./player-bottom-nav";

interface Props {
  playerName: string;
  canReturnToDashboard: boolean;
  children:   React.ReactNode;
}

export function PlayerShell({ playerName, canReturnToDashboard, children }: Props) {
  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* Sidebar — tablet+ only (hidden on mobile, shown md+) */}
      <div className="hidden md:flex w-64 flex-none">
        <PlayerSidebar playerName={playerName} canReturnToDashboard={canReturnToDashboard} />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header — brand bar, no hamburger */}
        <header
          className="md:hidden flex shrink-0 items-center px-4 border-b"
          style={{
            background: "#0A1220",
            borderColor: "rgba(255,255,255,.08)",
            minHeight: "calc(3.5rem + env(safe-area-inset-top))",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <span
            className="font-condensed font-bold text-lg uppercase tracking-wide"
            style={{ color: "#F97316" }}
          >
            Área do Jogador
          </span>
          {canReturnToDashboard && (
            <Link
              href="/dashboard"
              className="ml-auto flex items-center gap-1.5 rounded-md px-2 text-xs font-medium text-white/70 hover:text-white"
              style={{ minHeight: 44 }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Gestão
            </Link>
          )}
        </header>

        <main
          className="flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-6"
          style={{
            paddingBottom: "calc(var(--bottom-nav-h, 56px) + 16px)",
            background: "var(--background)",
          }}
        >
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <PlayerBottomNav />
    </div>
  );
}
