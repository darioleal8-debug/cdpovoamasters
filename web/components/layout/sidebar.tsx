"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  CalendarRange,
  CreditCard,
  Dumbbell,
  History,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Trophy,
  Users,
  UserCog,
  FileUp,
  Landmark,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useClubSettings } from "@/lib/club-context";
import { useUnreadChatCount } from "@/hooks/use-unread-chat-count";
import type { UserRole } from "@/types/database";
import { NavLink } from "@/components/layout/nav-link";

const mainItems = [
  { label: "Visão Geral", href: "/dashboard", icon: LayoutDashboard, exact: true as const },
];

const managementItems = [
  { label: "Temporadas",       href: "/temporadas",    icon: CalendarRange },
  { label: "Plantel",           href: "/jogadores",     icon: Users },
  { label: "Gestão de Contas", href: "/gestao-contas", icon: UserCog },
  { label: "Jogos",            href: "/jogos",         icon: Calendar },
  { label: "Treinos",          href: "/treinos",       icon: Dumbbell },
  { label: "Pagamentos",       href: "/pagamentos",    icon: CreditCard },
  { label: "Estatísticas",     href: "/estatisticas",  icon: BarChart3 },
  { label: "Histórico",        href: "/historico",     icon: History   },
  { label: "Palmarés",         href: "/palmares",      icon: Trophy    },
];

const playerAreaItems = [
  { label: "Os Meus Jogos",   href: "/player/meus-jogos",   icon: Calendar },
  { label: "Os Meus Treinos", href: "/player/meus-treinos", icon: Dumbbell },
];

const seccionistaItems = [
  { label: "Jogos",        href: "/jogos",        icon: Calendar },
  { label: "Estatísticas", href: "/estatisticas", icon: BarChart3 },
  { label: "Palmarés",     href: "/palmares",     icon: Trophy    },
];

const communicationItems = [
  { label: "Chat Interno", href: "/chat", icon: MessageSquare },
];

const accountItems = [
  { label: "Configurações",       href: "/configuracoes",          icon: Settings },
  { label: "Importar Calendário", href: "/configuracoes/importar", icon: FileUp },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-label" style={{ color: "rgba(255,255,255,.3)" }}>
      {children}
    </p>
  );
}

export function Sidebar({ role, rolesExtra = [] }: { role?: UserRole; rolesExtra?: string[] }) {
  const { settings } = useClubSettings();
  const unreadChatCount = useUnreadChatCount();

  const rolesAll = [role, ...rolesExtra].filter(Boolean) as string[];
  const isSeccionista    = role === "seccionista";
  const isManager        = rolesAll.includes("admin") || rolesAll.includes("treinador");
  const hasFinanceAccess = rolesAll.includes("admin") || rolesAll.includes("tesoureiro");

  return (
    <aside
      className="flex h-full w-64 flex-col"
      style={{ backgroundColor: "var(--ink, #0A1220)" }}
    >
      {/* Logo */}
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b px-5" style={{ borderColor: "rgba(255,255,255,.08)" }}>
        {settings.logo_url ? (
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-white">
            <Image src={settings.logo_url} alt={settings.club_name} fill sizes="36px" className="object-contain p-0.5" />
          </div>
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white"
            style={{ background: "var(--action, #F97316)" }}
          >
            CDP
          </div>
        )}
        <div className="flex flex-col leading-tight">
          <span className="font-condensed text-sm font-bold uppercase tracking-display text-white">
            CD Póvoa
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-label" style={{ color: "rgba(255,255,255,.4)" }}>
            Masters · Basquetebol
          </span>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        {isSeccionista ? (
          <>
            <SectionLabel>Área de Jogo</SectionLabel>
            <div className="space-y-0.5">
              {seccionistaItems.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>
            <SectionLabel>Comunicação</SectionLabel>
            <div className="space-y-0.5">
              {communicationItems.map((item) => (
                <NavLink key={item.href} {...item} badge={unreadChatCount} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-0.5">
              {mainItems.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>

            <Separator className="my-3" style={{ background: "rgba(255,255,255,.08)" }} />

            <SectionLabel>Gestão</SectionLabel>
            <div className="space-y-0.5">
              {managementItems.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>

            {hasFinanceAccess && (
              <>
                <SectionLabel>Financeiro</SectionLabel>
                <div className="space-y-0.5">
                  <NavLink href="/financeiro" icon={Landmark} label="Gestão Financeira" />
                </div>
              </>
            )}

            {isManager && (
              <>
                <SectionLabel>Área de Jogador</SectionLabel>
                <div className="space-y-0.5">
                  {playerAreaItems.map((item) => (
                    <NavLink key={item.href} {...item} />
                  ))}
                </div>
              </>
            )}

            <SectionLabel>Comunicação</SectionLabel>
            <div className="space-y-0.5">
              {communicationItems.map((item) => (
                <NavLink key={item.href} {...item} badge={unreadChatCount} />
              ))}
            </div>

            <div className="mt-auto pt-4">
              <Separator className="mb-3" style={{ background: "rgba(255,255,255,.08)" }} />
              <SectionLabel>Conta</SectionLabel>
              <div className="space-y-0.5">
                {accountItems.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
