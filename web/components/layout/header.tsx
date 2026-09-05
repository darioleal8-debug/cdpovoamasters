"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Moon, Sun, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";

interface HeaderProps {
  userName:  string;
  userEmail: string;
  userRole:  string;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin:       "Administrador",
  treinador:   "Treinador",
  jogador:     "Jogador",
  seccionista: "Seccionista",
  tesoureiro:  "Tesoureiro",
};

// Títulos curtos por rota (2-3 palavras)
const ROUTE_TITLES: Record<string, string> = {
  "/dashboard":       "Hoje",
  "/jogos":           "Agenda",
  "/treinos":         "Treinos",
  "/pagamentos":      "Pagamentos",
  "/jogadores":       "Plantel",
  "/estatisticas":    "Estatísticas",
  "/chat":            "Chat",
  "/temporadas":      "Temporadas",
  "/gestao-contas":   "Contas",
  "/historico":       "Histórico",
  "/financeiro":      "Financeiro",
  "/configuracoes":   "Definições",
};

function getTitle(pathname: string): string {
  for (const [route, label] of Object.entries(ROUTE_TITLES)) {
    if (pathname === route || pathname.startsWith(route + "/")) return label;
  }
  return "HoopHub";
}

export function Header({ userName, userEmail, userRole }: HeaderProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [theme, setTheme]       = useState<"light" | "dark">("light");
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<Element | null>(null);

  useEffect(() => {
    const stored    = localStorage.getItem("theme") as "light" | "dark" | null;
    const prefersDk = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial   = stored ?? (prefersDk ? "dark" : "light");
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  // Detectar scroll do contentor principal para colapsar o header
  useEffect(() => {
    setScrolled(false);
    // O main scroll está num elemento com overflow-y:auto — usa o event bubbling
    function onScroll(e: Event) {
      const el = e.target as Element;
      setScrolled(el.scrollTop > 12);
    }
    // Precisa de captura porque o scroll não bubbles por defeito
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [pathname]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: "Sessão terminada", description: "Até breve!" });
    router.push("/login");
    router.refresh();
  }

  const title = getTitle(pathname);

  return (
    <header
      className="shrink-0 flex items-center justify-between px-4 transition-all duration-200"
      style={{
        background:   "#ffffff",
        borderBottom: "1px solid var(--line, #E4E7EE)",
        height:       scrolled ? 52 : 64,
        paddingTop:   `env(safe-area-inset-top)`,
      }}
    >
      {/* Título da rota atual (mobile/tablet) — esconde no desktop onde a sidebar já é o contexto */}
      <h1
        className="xl:hidden font-condensed font-bold uppercase tracking-display transition-all duration-200 truncate"
        style={{
          fontSize: scrolled ? 15 : 20,
          color:    "var(--ink, #0A1220)",
        }}
      >
        {title}
      </h1>

      {/* Data — visível só no desktop. suppressHydrationWarning: servidor UTC-4 vs browser UTC+1 */}
      <p className="hidden xl:block text-[13px] font-semibold capitalize" style={{ color: "var(--muted-text,#5A6478)" }} suppressHydrationWarning>
        {new Date().toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" })}
      </p>

      {/* Direita: tema + utilizador */}
      <div className="flex items-center gap-1 ml-auto">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme} aria-label="Alternar tema">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex h-auto items-center gap-2 px-2 py-1.5" style={{ minHeight: 44 }}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs font-bold text-white" style={{ backgroundColor: "var(--ink, #0A1220)" }}>
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden xl:flex flex-col items-start text-left">
                <span className="text-sm font-medium">{userName}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[userRole] ?? userRole}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 bg-white border border-gray-200 shadow-xl rounded-xl p-1">
            <DropdownMenuLabel className="font-normal px-3 py-2">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-semibold text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500">{userEmail}</p>
                <p className="text-xs text-gray-400">{ROLE_LABELS[userRole] ?? userRole}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-gray-100 my-1" />
            <DropdownMenuItem
              onClick={() => router.push("/configuracoes")}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              style={{ minHeight: 44 }}
            >
              <User className="mr-2 h-4 w-4 text-gray-500" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-100 my-1" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              style={{ minHeight: 44 }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
