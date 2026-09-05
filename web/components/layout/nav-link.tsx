"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  exact?: boolean;
}

export function NavLink({ href, icon: Icon, label, badge, exact = false }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "text-white"
          : "text-white/55 hover:bg-white/8 hover:text-white/85"
      )}
      style={isActive ? { background: "var(--action, #F97316)", color: "#ffffff" } : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      {!!badge && badge > 0 && (
        <span
          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={isActive
            ? { background: "rgba(255,255,255,.25)", color: "#ffffff" }
            : { background: "var(--action, #F97316)", color: "#ffffff" }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
