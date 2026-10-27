"use client";

import { RoleSwitcherChip } from "@/components/auth/role-switcher";
import { PlayerSidebar } from "./player-sidebar";
import { PlayerBottomNav } from "./player-bottom-nav";
import { useActivityTracker } from "@/hooks/use-activity-tracker";

interface Props {
  playerName: string;
  availableRoles: string[];
  activeRole:     string;
  children:   React.ReactNode;
}

export function PlayerShell({ playerName, availableRoles, activeRole, children }: Props) {
  useActivityTracker();
  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* Sidebar — desktop only (hidden on mobile, shown md+) */}
      <div className="hidden md:flex flex-none" style={{ width: "208px" }}>
        <PlayerSidebar playerName={playerName} availableRoles={availableRoles} activeRole={activeRole} />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header
          className="md:hidden flex shrink-0 items-center px-4"
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
          <div className="ml-auto">
            <RoleSwitcherChip roles={availableRoles} activeRole={activeRole} />
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto overscroll-y-contain"
          style={{
            padding: "0",
            paddingBottom: "calc(var(--bottom-nav-h, 56px) + 8px)",
            background: "#F4EFE8",
          }}
        >
          <div className="p-4 md:p-7">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <PlayerBottomNav />
    </div>
  );
}
