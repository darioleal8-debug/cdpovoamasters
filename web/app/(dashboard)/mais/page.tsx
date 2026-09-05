"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  Dumbbell,
  History,
  Landmark,
  LogOut,
  Settings,
  Users,
  UserCog,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";

interface MenuItem {
  label:    string;
  href:     string;
  icon:     React.ElementType;
  desc:     string;
}

const ITEMS: MenuItem[] = [
  { label: "Plantel",          href: "/jogadores",     icon: Users,        desc: "Jogadores, fotos e perfis" },
  { label: "Temporadas",       href: "/temporadas",    icon: CalendarRange, desc: "Gerir épocas desportivas" },
  { label: "Treinos",          href: "/treinos",       icon: Dumbbell,      desc: "Sessões e presenças" },
  { label: "Estatísticas",     href: "/estatisticas",  icon: BarChart3,     desc: "Análise da época" },
  { label: "Histórico",        href: "/historico",     icon: History,       desc: "Épocas anteriores" },
  { label: "Financeiro",       href: "/financeiro",    icon: Landmark,      desc: "Caixa e entradas" },
  { label: "Gestão de Contas", href: "/gestao-contas", icon: UserCog,       desc: "Contas de utilizador" },
  { label: "Configurações",    href: "/configuracoes", icon: Settings,      desc: "Preferências do clube" },
];

export default function MaisPage() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: "Sessão terminada", description: "Até breve!" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="font-condensed font-bold text-2xl uppercase tracking-display"
        style={{ color: "var(--ink,#0A1220)" }}>
        Mais
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ITEMS.map(({ label, href, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-2 rounded-2xl p-4 transition-colors active:opacity-70"
            style={{
              background:   "var(--paper,#F6F7F9)",
              border:       "1px solid var(--line,#E4E7EE)",
              touchAction:  "manipulation",
              minHeight:    80,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: "var(--action,#F97316)" }} />
            <div>
              <p className="text-[14px] font-semibold leading-tight"
                style={{ color: "var(--ink,#0A1220)" }}>
                {label}
              </p>
              <p className="text-[11px] mt-0.5 leading-tight"
                style={{ color: "var(--muted-text,#5A6478)" }}>
                {desc}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Terminar sessão */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-2xl p-4 transition-colors active:opacity-70"
          style={{
            background:  "rgba(217,45,32,.06)",
            border:      "1px solid rgba(217,45,32,.12)",
            touchAction: "manipulation",
          }}
        >
          <LogOut className="h-5 w-5 shrink-0" style={{ color: "var(--bad,#D92D20)" }} />
          <span className="text-[14px] font-semibold" style={{ color: "var(--bad,#D92D20)" }}>
            Terminar sessão
          </span>
        </button>
      </div>
    </div>
  );
}
