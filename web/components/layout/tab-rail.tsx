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
  Megaphone,
  Users,
  UserCog,
  Settings,
  History,
  Landmark,
  Shield,
  FolderOpen,
} from "lucide-react";
import { useUnreadAnnouncements } from "@/hooks/use-unread-announcements";
import { useClubSettings } from "@/lib/club-context";
import { useClubLeague } from "@/hooks/use-club-league";
import type { UserRole } from "@/types/database";

interface RailItem {
  label:  string;
  href:   string;
  icon:   React.ElementType;
  exact?: boolean;
  external?: boolean;
}

const PRIMARY: RailItem[] = [
  { label: "Hoje",    href: "/dashboard",  icon: LayoutDashboard, exact: true },
  { label: "Agenda",  href: "/jogos",      icon: Calendar },
  { label: "Avisos",  href: "/comunicados", icon: Megaphone },
  { label: "Quotas",  href: "/pagamentos", icon: CreditCard },
  { label: "Plantel", href: "/jogadores",  icon: Users },
];

const SECONDARY: RailItem[] = [
  { label: "Treinos",    href: "/treinos",       icon: Dumbbell },
  { label: "Temporadas", href: "/temporadas",    icon: CalendarRange },
  { label: "Contas",     href: "/gestao-contas", icon: UserCog },
  { label: "Resumo",     href: "/estatisticas",  icon: BarChart3 },
  { label: "Docs",       href: "/documentos",    icon: FolderOpen },
  { label: "Financeiro", href: "/financeiro",    icon: Landmark },
  { label: "Hist. Stats", href: "/historico",    icon: History },
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
      {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
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
            className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[11px] font-bold"
            style={{ background: "#F97316", color: "#fff" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span
        className="text-[11px] font-semibold text-center leading-tight"
        style={{ color: active ? "#F97316" : "rgba(255,255,255,.4)" }}
      >
        {label}
      </span>
    </Link>
  );
}

export function TabRail({ role, rolesExtra = [] }: { role?: UserRole; rolesExtra?: string[] }) {
  const { settings }  = useClubSettings();
  const chatBadge     = useUnreadAnnouncements();
  const { league }    = useClubLeague();
  const rolesAll      = [role, ...rolesExtra].filter(Boolean) as string[];
  const isManager     = rolesAll.includes("admin") || rolesAll.includes("treinador");
  const hasFinance    = rolesAll.includes("admin") || rolesAll.includes("tesoureiro");

  const secondary: RailItem[] = SECONDARY.filter((item) => {
    if (item.href === "/financeiro") return hasFinance;
    if (item.href === "/gestao-contas") return isManager;
    return true;
  });
  // Liga do clube (Liga INATEL ou outra); sem liga → sem item. Inserida antes de "Definições".
  if (league) {
    const at = secondary.findIndex((i) => i.href === "/configuracoes");
    secondary.splice(at < 0 ? secondary.length : at, 0, { label: "Liga", href: league.href, icon: Shield, external: league.external });
  }

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
          <span className="font-condensed text-xs font-bold text-white">{(settings.club_name || "CD").split(" ").filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase()}</span>
        )}
      </div>

      {/* Primários */}
      <div className="flex w-full flex-col items-center gap-0.5 px-1">
        {PRIMARY.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            badge={item.href === "/comunicados" ? chatBadge : undefined}
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
