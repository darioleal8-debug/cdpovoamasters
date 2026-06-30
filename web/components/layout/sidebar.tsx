"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  CalendarRange,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
  UserCog,
  FileUp,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useClubSettings } from "@/lib/club-context";
import { useUnreadChatCount } from "@/hooks/use-unread-chat-count";
import type { UserRole } from "@/types/database";

const mainItems = [
  { label: "Visão Geral", href: "/dashboard", icon: LayoutDashboard },
];

const managementItems = [
  { label: "Temporadas",       href: "/temporadas",    icon: CalendarRange },
  { label: "Jogadores",        href: "/jogadores",     icon: Users },
  { label: "Gestão de Contas", href: "/gestao-contas", icon: UserCog },
  { label: "Jogos",            href: "/jogos",         icon: Calendar },
  { label: "Treinos",          href: "/treinos",       icon: Dumbbell },
  { label: "Pagamentos",       href: "/pagamentos",    icon: CreditCard },
  { label: "Estatísticas",     href: "/estatisticas",  icon: BarChart3 },
];

const playerAreaItems = [
  { label: "Os Meus Jogos",   href: "/player/meus-jogos",   icon: Calendar },
  { label: "Os Meus Treinos", href: "/player/meus-treinos", icon: Dumbbell },
];

const seccionistaItems = [
  { label: "Jogos",        href: "/jogos",        icon: Calendar },
  { label: "Estatísticas", href: "/estatisticas", icon: BarChart3 },
];

const communicationItems = [
  { label: "Chat Interno", href: "/chat", icon: MessageSquare },
];

const accountItems = [
  { label: "Configurações",       href: "/configuracoes",          icon: Settings },
  { label: "Importar Calendário", href: "/configuracoes/importar", icon: FileUp },
];

function NavLink({
  href,
  icon: Icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/65 hover:bg-white/7 hover:text-white/90"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      {!!badge && badge > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white" style={{ backgroundColor: "var(--club-secondary, #F28C28)" }}>
          {badge}
        </span>
      )}
      {isActive && !badge && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--club-secondary, #F28C28)" }} />
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-2 pt-5 text-[0.68rem] font-semibold uppercase tracking-widest text-white/30">
      {children}
    </p>
  );
}

export function Sidebar({ role }: { role?: UserRole }) {
  const { settings } = useClubSettings();
  const unreadChatCount = useUnreadChatCount();

  const isSeccionista = role === "seccionista";
  const isManager     = role === "admin" || role === "treinador";

  return (
    <aside
      className="flex h-full w-64 flex-col"
      style={{ backgroundColor: "var(--club-primary, #111111)" }}
    >
      {/* Logo */}
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
        {settings.logo_url ? (
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-2 ring-white/20">
            <Image src={settings.logo_url} alt={settings.club_name} fill sizes="36px" className="object-contain" />
          </div>
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white ring-2 ring-white/20"
            style={{ backgroundColor: "var(--club-secondary, #F28C28)" }}
          >
            CDP
          </div>
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold uppercase tracking-wide text-white">
            CD Póvoa
          </span>
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest opacity-75" style={{ color: "var(--club-secondary, #F28C28)" }}>
            Masters
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

            <Separator className="my-3 bg-white/10" />

            <SectionLabel>Gestão</SectionLabel>
            <div className="space-y-0.5">
              {managementItems.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>

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
              <Separator className="mb-3 bg-white/10" />
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
