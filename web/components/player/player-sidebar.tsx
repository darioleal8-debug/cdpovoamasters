"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2, Calendar, ClipboardList, CreditCard, Dumbbell,
  Home, LogOut, MessageSquare, Trophy, User, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUnreadChatCount } from "@/hooks/use-unread-chat-count";
import { toast } from "@/components/ui/toaster";
import { RoleSwitcherChip } from "@/components/auth/role-switcher";

const PLAYER_NAV = [
  { href: "/player/minha-area",       label: "Início",              icon: Home,          exact: true  },
  { href: "/player/plantel",          label: "Plantel",             icon: Users,         exact: false },
  { href: "/player/meu-perfil",       label: "O Meu Perfil",        icon: User,          exact: false },
  { href: "/player/meus-jogos",       label: "Os Meus Jogos",       icon: Calendar,      exact: false },
  { href: "/player/meus-treinos",     label: "Os Meus Treinos",     icon: Dumbbell,      exact: false },
  { href: "/player/assiduidade",      label: "A Minha Assiduidade", icon: BarChart2,     exact: false },
  { href: "/player/meus-pagamentos",  label: "Os Meus Pagamentos",  icon: CreditCard,    exact: false },
  { href: "/player/laboratorio",      label: "Laboratório",         icon: ClipboardList, exact: false },
  { href: "/player/palmares",         label: "Palmarés",            icon: Trophy,        exact: false },
  { href: "/player/chat",             label: "Chat",                icon: MessageSquare, exact: false },
] as const;

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function PlayerSidebar({
  playerName = "Jogador",
  availableRoles = [],
  activeRole = "jogador",
}: {
  playerName?: string;
  availableRoles?: string[];
  activeRole?: string;
}) {
  const pathname  = usePathname();
  const router    = useRouter();
  const supabase  = createClient();
  const chatBadge = useUnreadChatCount();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: "Sessão terminada", description: "Até breve!" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="flex h-full flex-col overflow-hidden"
      style={{ width: "208px", background: "#15110E", flexShrink: 0 }}
    >
      {/* ── Logo ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "18px 16px 16px",
          borderBottom: "1px solid rgba(255,255,255,.08)",
        }}
      >
        {/* Bola laranja */}
        <div
          aria-hidden
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "#F97316",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-barlow-condensed, sans-serif)",
            fontWeight: 700,
            fontSize: "16px",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "#F6F2EC",
            lineHeight: 1,
          }}
        >
          HOOPHUB
        </span>
      </div>

      {/* ── Navegação ── */}
      <nav className="flex flex-1 flex-col overflow-y-auto" style={{ padding: "12px 8px" }}>
        {availableRoles.length > 1 && (
          <div style={{ marginBottom: "12px", padding: "0 4px" }}>
            <RoleSwitcherChip roles={availableRoles} activeRole={activeRole} />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {PLAYER_NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            const badge  = item.href === "/player/chat" ? chatBadge : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "9px 10px",
                  borderRadius: "6px",
                  textDecoration: "none",
                  background: active ? "rgba(249,115,22,.16)" : "transparent",
                  color: active ? "#F97316" : "rgba(246,242,236,.65)",
                  transition: "background .15s, color .15s",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.05)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <item.icon size={16} style={{ flexShrink: 0 }} />
                <span
                  style={{
                    fontFamily: "var(--font-barlow-condensed, sans-serif)",
                    fontWeight: 600,
                    fontSize: "15px",
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </span>
                {badge > 0 && (
                  <span
                    style={{
                      background: "#F97316",
                      color: "#fff",
                      borderRadius: "999px",
                      fontSize: "10px",
                      fontWeight: 700,
                      minWidth: "18px",
                      height: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                      flexShrink: 0,
                    }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Utilizador ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", padding: "14px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "oklch(0.5 0.13 45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontFamily: "var(--font-barlow-condensed, sans-serif)",
              fontWeight: 700,
              fontSize: "13px",
              color: "#fff",
              letterSpacing: ".04em",
            }}
          >
            {initials(playerName)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                fontFamily: "var(--font-barlow-condensed, sans-serif)",
                fontWeight: 600,
                fontSize: "13px",
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: "#F6F2EC",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}
            >
              {playerName}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            padding: "7px 6px",
            borderRadius: "6px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "rgba(246,242,236,.45)",
            fontFamily: "var(--font-barlow-condensed, sans-serif)",
            fontWeight: 600,
            fontSize: "13px",
            letterSpacing: ".04em",
            textTransform: "uppercase",
            transition: "color .15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(246,242,236,.8)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(246,242,236,.45)"; }}
        >
          <LogOut size={14} />
          Sair
        </button>
      </div>
    </aside>
  );
}
