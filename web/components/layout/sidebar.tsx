"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calendar,
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
  FileUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const navItems = [
  {
    label: "Visão Geral",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
];

const managementItems = [
  { label: "Temporadas",   href: "/temporadas",   icon: CalendarRange },
  { label: "Jogadores",    href: "/jogadores",    icon: Users },
  { label: "Jogos",        href: "/jogos",        icon: Calendar },
  { label: "Pagamentos",   href: "/pagamentos",   icon: CreditCard },
  { label: "Estatísticas", href: "/estatisticas", icon: BarChart3 },
];

const communicationItems = [
  { label: "Chat Interno", href: "/chat", icon: MessageSquare },
];

const accountItems = [
  { label: "Configurações",        href: "/configuracoes",          icon: Settings },
  { label: "Importar Calendário",  href: "/configuracoes/importar", icon: FileUp   },
];

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
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
      {isActive && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-500" />
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

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col bg-cdpovoa-blue">
      {/* Logo */}
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-800 text-xs font-bold text-white ring-2 ring-white/20">
          CDP
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold uppercase tracking-wide text-white">
            CD Póvoa
          </span>
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-red-400">
            Masters
          </span>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        <div className="space-y-0.5">
          {navItems.map((item) => (
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

        <SectionLabel>Comunicação</SectionLabel>
        <div className="space-y-0.5">
          {communicationItems.map((item) => (
            <NavLink key={item.href} {...item} />
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
      </nav>
    </aside>
  );
}
