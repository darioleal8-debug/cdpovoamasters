"use client";

import { PlayerSidebar } from "./player-sidebar";
import { PlayerBottomNav } from "./player-bottom-nav";

interface Props {
  playerName: string;
  userRole:   "admin" | "treinador" | "jogador";
  children:   React.ReactNode;
}

export function PlayerShell({ playerName, userRole, children }: Props) {
  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* Sidebar — tablet+ only (hidden on mobile, shown md+) */}
      <div className="hidden md:flex w-64 flex-none">
        <PlayerSidebar playerName={playerName} userRole={userRole} />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header — brand bar, no hamburger */}
        <header
          className="md:hidden flex h-14 shrink-0 items-center px-4 border-b"
          style={{
            background: "#0A1220",
            borderColor: "rgba(255,255,255,.08)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <span
            className="font-condensed font-bold text-lg uppercase tracking-wide"
            style={{ color: "#F97316" }}
          >
            Área do Jogador
          </span>
        </header>

        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
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
