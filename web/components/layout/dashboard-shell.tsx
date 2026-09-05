"use client";

import { Sidebar }   from "./sidebar";
import { TabRail }   from "./tab-rail";
import { BottomNav } from "./bottom-nav";
import { Header }    from "./header";
import type { UserRole } from "@/types/database";

interface Props {
  userName:       string;
  userEmail:      string;
  userRole:       UserRole;
  userRolesExtra: UserRole[];
  children:       React.ReactNode;
}

export function DashboardShell({ userName, userEmail, userRole, userRolesExtra, children }: Props) {
  return (
    /*
     * Shell de 100dvh — evita o bug do vh em iOS com barra do Safari.
     *
     * Telemóvel  (< md):   coluna única; bottom-nav fixo no fundo
     * Tablet     (md–xl):  rail 88px | coluna de conteúdo
     * Desktop    (xl+):    sidebar 256px | coluna de conteúdo
     */
    <div
      className="flex overflow-hidden"
      style={{ height: "100dvh" }}
    >
      {/* ── Sidebar (desktop ≥ 1280 px) ─────────────────────────── */}
      <div className="hidden xl:block shrink-0" style={{ width: "var(--sidebar-w, 256px)" }}>
        <Sidebar role={userRole} rolesExtra={userRolesExtra} />
      </div>

      {/* ── Tab Rail (tablet 768–1279 px) ────────────────────────── */}
      <TabRail role={userRole} rolesExtra={userRolesExtra} />

      {/* ── Coluna principal ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header userName={userName} userEmail={userEmail} userRole={userRole} />

        {/*
         * Área de scroll do conteúdo.
         * Em mobile adicionamos padding-bottom igual à altura da barra inferior
         * para que o conteúdo não fique tapado.
         */}
        <main className="flex-1 overflow-y-auto bg-background">
          {/*
           * Padding bottom: mobile → espaço para a bottom-nav + gap
           *                  tablet+ → padding normal (bottom-nav esconde em md:hidden)
           * Feito via classes Tailwind para que o xl reset funcione sem inline style condicional.
           */}
          <div
            className="p-4 md:p-6"
            style={{ paddingBottom: "calc(var(--bottom-nav-h, 56px) + 16px)", minHeight: "100%" }}
          >
            {children}
          </div>
        </main>
      </div>

      {/* ── Bottom Nav (telemóvel < 768 px) ──────────────────────── */}
      <BottomNav />
    </div>
  );
}
