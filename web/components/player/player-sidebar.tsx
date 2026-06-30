"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, CreditCard, Dumbbell, Home, LogOut, MessageSquare, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useClubSettings } from "@/lib/club-context";
import { useUnreadChatCount } from "@/hooks/use-unread-chat-count";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const PLAYER_NAV = [
  { href: "/player",                label: "Início",             icon: Home },
  { href: "/player/meu-perfil",     label: "O Meu Perfil",       icon: User },
  { href: "/player/meus-jogos",     label: "Os Meus Jogos",      icon: Calendar },
  { href: "/player/meus-treinos",   label: "Os Meus Treinos",    icon: Dumbbell },
  { href: "/player/meus-pagamentos",label: "Os Meus Pagamentos", icon: CreditCard },
  { href: "/player/chat",           label: "Chat",               icon: MessageSquare },
];

function NavLink({ href, icon: Icon, label, exact = false, badge }: {
  href: string; icon: React.ElementType; label: string; exact?: boolean; badge?: number;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

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
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
          style={{ backgroundColor: "var(--club-secondary, #F28C28)" }}>
          {badge}
        </span>
      )}
      {isActive && !badge && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--club-secondary, #F28C28)" }} />
      )}
    </Link>
  );
}

export function PlayerSidebar({
  playerName,
  userRole,
}: {
  playerName?: string;
  userRole?: "admin" | "treinador" | "jogador";
}) {
  const { settings } = useClubSettings();
  const router  = useRouter();
  const supabase = createClient();
  const unreadChatCount = useUnreadChatCount();
  const isManager = userRole === "admin" || userRole === "treinador";

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: "Sessão terminada", description: "Até breve!" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="flex h-full w-64 flex-col"
      style={{ backgroundColor: "var(--club-primary, #111111)" }}
    >
      {/* Logo / cabeçalho */}
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
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-sm font-bold uppercase tracking-wide text-white truncate">
            {playerName ?? "Jogador"}
          </span>
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest opacity-75"
            style={{ color: "var(--club-secondary, #F28C28)" }}>
            Área do Jogador
          </span>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        {isManager && (
          <div className="mb-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium text-white/40 hover:text-white/75 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span>Voltar ao Dashboard</span>
            </Link>
          </div>
        )}

        <div className="space-y-0.5">
          {PLAYER_NAV.map((item, i) => (
            <NavLink key={item.href} exact={i === 0} {...item} badge={item.href === "/player/chat" ? unreadChatCount : undefined} />
          ))}
        </div>

        <div className="mt-auto pt-4">
          <div className="border-t border-white/10 pt-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/65 transition-colors hover:bg-white/7 hover:text-white/90"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
