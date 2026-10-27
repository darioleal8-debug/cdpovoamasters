"use client";

import { RoleSwitcherChip } from "@/components/auth/role-switcher";
import { PlayerSidebar } from "./player-sidebar";
import { PlayerBottomNav } from "./player-bottom-nav";
import { PlayerPendingProvider } from "./player-pending-context";
import { useActivityTracker } from "@/hooks/use-activity-tracker";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

interface Props {
  playerName: string;
  availableRoles: string[];
  activeRole:     string;
  playerJersey?:  string | null;
  playerPosition?: string | null;
  children:       React.ReactNode;
}

export function PlayerShell({
  playerName,
  availableRoles,
  activeRole,
  playerJersey,
  playerPosition,
  children,
}: Props) {
  useActivityTracker();
  return (
    <PlayerPendingProvider>
      <div
        className="flex overflow-hidden"
        style={{ height: "100dvh" }}
      >
        {/* Sidebar — desktop only (≥900px) */}
        <div className="hidden desk:flex flex-none" style={{ width: "208px" }}>
          <PlayerSidebar
            playerName={playerName}
            availableRoles={availableRoles}
            activeRole={activeRole}
            playerJersey={playerJersey}
            playerPosition={playerPosition}
          />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile header (hidden ≥900px) */}
          <header
            className="desk:hidden flex shrink-0 items-center px-4"
            style={{
              background: "#15110E",
              borderBottom: "1px solid rgba(255,255,255,.08)",
              minHeight: "calc(3.25rem + env(safe-area-inset-top))",
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            {/* Bola laranja + HOOPHUB */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                aria-hidden
                style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#F97316", flexShrink: 0 }}
              />
              <span
                style={{
                  fontFamily: "var(--font-barlow-condensed, sans-serif)",
                  fontWeight: 700,
                  fontSize: "15px",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "#F6F2EC",
                }}
              >
                HOOPHUB
              </span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <RoleSwitcherChip roles={availableRoles} activeRole={activeRole} />
              {/* Avatar do jogador */}
              <div
                aria-hidden
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "oklch(0.5 0.13 45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: "var(--font-barlow-condensed, sans-serif)",
                  fontWeight: 700,
                  fontSize: "12px",
                  color: "#fff",
                  letterSpacing: ".04em",
                }}
              >
                {initials(playerName)}
              </div>
            </div>
          </header>

          <main
            className="flex-1 overflow-y-auto overscroll-y-contain"
            style={{
              paddingBottom: "calc(var(--bottom-nav-h, 56px) + 8px)",
              background: "#F4EFE8",
            }}
          >
            <div className="p-4 desk:p-7">
              {children}
            </div>
          </main>
        </div>

        {/* Bottom nav — mobile only (hidden ≥900px) */}
        <PlayerBottomNav />
      </div>
    </PlayerPendingProvider>
  );
}
