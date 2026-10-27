"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Dumbbell, Calendar, Users, MoreHorizontal,
  User, BarChart2, CreditCard, MessageSquare, Trophy, ClipboardList, X,
} from "lucide-react";
import { useUnreadChatCount } from "@/hooks/use-unread-chat-count";
import { useState } from "react";

const PRIMARY_NAV = [
  { label: "Início",  href: "/player/minha-area",    icon: Home,     exact: true  },
  { label: "Treinos", href: "/player/meus-treinos",  icon: Dumbbell, exact: false },
  { label: "Jogos",   href: "/player/meus-jogos",    icon: Calendar, exact: false },
  { label: "Equipa",  href: "/player/plantel",        icon: Users,    exact: false },
] as const;

const SHEET_NAV = [
  { label: "O Meu Perfil",       href: "/player/meu-perfil",      icon: User          },
  { label: "Assiduidade",        href: "/player/assiduidade",     icon: BarChart2     },
  { label: "Pagamentos",         href: "/player/meus-pagamentos", icon: CreditCard    },
  { label: "Chat",               href: "/player/chat",            icon: MessageSquare },
  { label: "Palmarés",           href: "/player/palmares",        icon: Trophy        },
  { label: "Laboratório",        href: "/player/laboratorio",     icon: ClipboardList },
] as const;

export function PlayerBottomNav() {
  const pathname  = usePathname();
  const chatBadge = useUnreadChatCount();
  const [sheetOpen, setSheetOpen] = useState(false);

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  }

  const maisActive = SHEET_NAV.some((item) => isActive(item.href, false));

  return (
    <>
      <nav
        role="navigation"
        aria-label="Navegação do jogador"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex"
        style={{
          background:    "#15110E",
          borderTop:     "1px solid rgba(255,255,255,.1)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {PRIMARY_NAV.map(({ label, href, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => setSheetOpen(false)}
              className="relative flex flex-1 flex-col items-center justify-end gap-0.5"
              style={{ minHeight: 56, paddingBottom: "8px", touchAction: "manipulation" }}
            >
              {/* Active indicator bar */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "20px",
                  height: "3px",
                  borderRadius: "0 0 2px 2px",
                  background: active ? "#F97316" : "transparent",
                  transition: "background .15s",
                }}
              />
              <Icon
                size={20}
                style={{ color: active ? "#F97316" : "rgba(255,255,255,.4)" }}
              />
              <span
                style={{
                  fontFamily: "var(--font-barlow-condensed, sans-serif)",
                  fontWeight: 600,
                  fontSize: "11px",
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  color: active ? "#F97316" : "rgba(255,255,255,.4)",
                  lineHeight: 1,
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* Mais */}
        <button
          type="button"
          aria-expanded={sheetOpen}
          aria-label="Mais opções"
          onClick={() => setSheetOpen((v) => !v)}
          className="relative flex flex-1 flex-col items-center justify-end gap-0.5"
          style={{
            minHeight: 56,
            paddingBottom: "8px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "20px",
              height: "3px",
              borderRadius: "0 0 2px 2px",
              background: maisActive || sheetOpen ? "#F97316" : "transparent",
              transition: "background .15s",
            }}
          />
          <MoreHorizontal
            size={20}
            style={{ color: maisActive || sheetOpen ? "#F97316" : "rgba(255,255,255,.4)" }}
          />
          <span
            style={{
              fontFamily: "var(--font-barlow-condensed, sans-serif)",
              fontWeight: 600,
              fontSize: "11px",
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: maisActive || sheetOpen ? "#F97316" : "rgba(255,255,255,.4)",
              lineHeight: 1,
            }}
          >
            Mais
          </span>
        </button>
      </nav>

      {/* ── Bottom sheet backdrop ── */}
      {sheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: "rgba(21,17,14,.6)", backdropFilter: "blur(2px)" }}
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Bottom sheet ── */}
      <div
        role="dialog"
        aria-label="Mais secções"
        aria-modal="true"
        className="md:hidden fixed inset-x-0 bottom-0 z-50"
        style={{
          background: "#1A1612",
          borderRadius: "16px 16px 0 0",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
          transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform .25s cubic-bezier(.4,0,.2,1)",
          pointerEvents: sheetOpen ? "auto" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px" }}>
          <span
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#8C837A",
            }}
          >
            MAIS SECÇÕES
          </span>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setSheetOpen(false)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#8C837A", padding: "4px" }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            padding: "4px 16px 16px",
          }}
        >
          {SHEET_NAV.map(({ label, href, icon: Icon }) => {
            const active = isActive(href, false);
            const badge  = href === "/player/chat" ? chatBadge : 0;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSheetOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  minHeight: "64px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: active ? "rgba(249,115,22,.14)" : "rgba(255,255,255,.05)",
                  textDecoration: "none",
                  position: "relative",
                }}
              >
                <Icon size={18} style={{ color: active ? "#F97316" : "#B9AFA4", flexShrink: 0 }} />
                <span
                  style={{
                    fontFamily: "var(--font-barlow-condensed, sans-serif)",
                    fontWeight: 600,
                    fontSize: "14px",
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: active ? "#F97316" : "#F6F2EC",
                    lineHeight: 1.2,
                  }}
                >
                  {label}
                </span>
                {badge > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      background: "#F97316",
                      color: "#fff",
                      borderRadius: "999px",
                      fontSize: "10px",
                      fontWeight: 700,
                      minWidth: "16px",
                      height: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 3px",
                    }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
