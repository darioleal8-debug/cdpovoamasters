"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePendingAccessRequests } from "@/hooks/use-pending-access-requests";

// Secções da área "Gestão HoopHub" (só Master Admin). Os URLs existentes mantêm-se.
export const HOOPHUB_SECTIONS: { label: string; href: string; exact?: boolean }[] = [
  { label: "Visão geral",      href: "/hoophub", exact: true },
  { label: "Clubes",           href: "/master-clubes" },
  { label: "Equipas da Liga",  href: "/liga", exact: true },
  { label: "Delegados Liga",   href: "/liga/delegados" },
  { label: "Notícias",         href: "/noticias-admin" },
  { label: "Utilização",       href: "/utilizacao" },
  { label: "Pedidos de acesso", href: "/master-pedidos" },
  { label: "Consumo de IA",    href: "/master-ia" },
];

export function HoopHubTabs() {
  const pathname = usePathname();
  const pending = usePendingAccessRequests(true);

  return (
    <div className="mb-4 border-b">
      <div className="flex items-center gap-2 px-1 pb-2">
        <Shield className="h-4 w-4" style={{ color: "var(--action,#F97316)" }} />
        <span className="font-condensed text-sm font-bold uppercase tracking-display">Gestão HoopHub</span>
        <span className="text-xs text-muted-foreground">· definições globais da plataforma (só Master Admin)</span>
      </div>
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Gestão HoopHub">
        {HOOPHUB_SECTIONS.map(({ label, href, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-orange-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {href === "/master-pedidos" && pending > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">{pending}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
