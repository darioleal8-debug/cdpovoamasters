"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  Calendar,
  CalendarRange,
  CreditCard,
  Dumbbell,
  BarChart3,
  MessageSquare,
  Users,
  UserCog,
  Settings,
  History,
  Landmark,
} from "lucide-react";
import { useUnreadChatCount } from "@/hooks/use-unread-chat-count";
import { useClubSettings } from "@/lib/club-context";
import type { UserRole } from "@/types/database";

interface RailItem {
  label:  string;
  href:   string;
  icon:   React.ElementType;
  exact?: boolean;
}

const PRIMARY: RailItem[] = [
  { label: "Hoje",    href: "/dashboard",  icon: LayoutDashboard, exact: true },
  { label: "Agenda",  href: "/jogos",      icon: Calendar },
  { label: "Chat",    href: "/chat",       icon: MessageSquare },
  { label: "Quotas",  href: "/pagamentos", icon: CreditCard },
  { label: "Plantel", href: "/jogadores",  icon: Users },
];

const SECONDARY: RailItem[] = [
  { label: "Treinos",    href: "/treinos",       icon: Dumbbell },
  { label: "Temporadas", href: "/temporadas",    icon: CalendarRange },
  { label: "Contas",     href: "/gestao-contas", icon: UserCog },
  { label: "Stats",      href: "/estatisticas",  icon: BarChart3 },
  { label: "Histórico",  href: "/historico",     icon: History },
  { label: "Financeiro", href: "/financeiro",    icon: Landmark },
  { label: "Definições", href: "/configuracoes", icon: Settings },
];

function RailLink({ item, badge }: { item: RailItem; badge?: number }) {
  const pathname = usePathname();
  const { icon: Icon, label, href, exact } = item;
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="relative flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 w-full transition-colors"
      style={{
        background: active ? "rgba(249,115,22,.15)" : "transparent",
        touchAction: "manipulation",
        minHeight: 64,
      }}
    >
      <div className="relative">
        <Icon
          className="h-5 w-5"
          style={{ color: active ? "#F97316" : "rgba(255,255,255,.45)" }}
        />
        {!!badge && badge > 0 && (
          <span
            className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold"
            style={{ background: "#F97316", color: "#fff" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span
        className="text-[10px] font-semibold text-center leading-tight"
        style={{ color: active ? "#F97316" : "rgba(255,255,255,.4)" }}
      >
        {label}
      </span>
    </Link>
  );
}

export function TabRail({ role, rolesExtra = [] }: { role?: UserRole; rolesExtra?: string[] }) {
  const { settings }  = useClubSettings();
  const chatBadge     = useUnreadChatCount();
  const rolesAll      = [role, ...rolesExtra].filter(Boolean) as string[];
  const isManager     = rolesAll.includes("admin") || rolesAll.includes("treinador");
  const hasFinance    = rolesAll.includes("admin") || rolesAll.includes("tesoureiro");

  const secondary = SECONDARY.filter((item) => {
    if (item.href === "/financeiro") return hasFinance;
    if (item.href === "/gestao-contas") return isManager;
    return true;
  });

  return (
    <aside
      className="hidden md:flex xl:hidden h-full flex-col items-center py-3 gap-1"
      style={{
        width: "var(--rail-w, 88px)",
        background: "#0A1220",
        borderRight: "1px solid rgba(255,255,255,.08)",
        overflowY: "auto",
        scrollbarWidth: "none",
      }}
      aria-label="Navegação principal"
    >
      {/* Emblema */}
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
        style={{ background: "var(--action,#F97316)" }}>
        {settings.logo_url ? (
          <Image src={settings.logo_url} alt={settings.club_name} width={36} height={36} className="rounded-lg object-contain" />
        ) : (
          <span className="font-condensed text-xs font-bold text-white">CDP</span>
        )}
      </div>

      {/* Primários */}
      <div className="flex w-full flex-col items-center gap-0.5 px-1">
        {PRIMARY.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            badge={item.href === "/chat" ? chatBadge : undefined}
          />
        ))}
      </div>

      {/* Divisor */}
      <div className="my-1 h-px w-10 shrink-0" style={{ background: "rgba(255,255,255,.08)" }} />

      {/* Secundários */}
      <div className="flex w-full flex-col items-center gap-0.5 px-1">
        {secondary.map((item) => (
          <RailLink key={item.href} item={item} />
        ))}
      </div>
    </aside>
  );
}
