"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  User,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { useUnreadChatCount } from "@/hooks/use-unread-chat-count";

const NAV_ITEMS = [
  { label: "Início",  href: "/player/minha-area", icon: LayoutDashboard, exact: true  },
  { label: "Plantel", href: "/player/plantel",    icon: Users,           exact: false },
  { label: "Chat",    href: "/player/chat",        icon: MessageSquare,   exact: false },
  { label: "Conta",   href: "/player/conta",       icon: User,            exact: false },
  { label: "Mais",    href: "/player/mais",        icon: MoreHorizontal,  exact: false },
] as const;

export function PlayerBottomNav() {
  const pathname  = usePathname();
  const chatBadge = useUnreadChatCount();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      role="navigation"
      aria-label="Navegação do jogador"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 flex"
      style={{
        background:    "#0A1220",
        borderTop:     "1px solid rgba(255,255,255,.08)",
        height:        "var(--bottom-nav-h)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_ITEMS.map(({ label, href, icon: Icon, exact }) => {
        const active = isActive(href, exact);
        const badge  = href === "/player/chat" ? chatBadge : 0;

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1"
            style={{ minHeight: 56, touchAction: "manipulation" }}
          >
            <div className="relative">
              <Icon
                className="h-5 w-5"
                style={{ color: active ? "#F97316" : "rgba(255,255,255,.45)" }}
              />
              {badge > 0 && (
                <span
                  className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[10px] font-bold"
                  style={{ background: "#F97316", color: "#fff" }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </div>
            <span
              className="text-[11px] font-semibold"
              style={{ color: active ? "#C2410C" : "rgba(255,255,255,.4)" }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
