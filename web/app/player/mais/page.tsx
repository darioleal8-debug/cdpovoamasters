"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dumbbell,
  CreditCard,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";

interface MenuItem {
  label: string;
  href:  string;
  icon:  React.ElementType;
  desc:  string;
}

const ITEMS: MenuItem[] = [
  { label: "Os Meus Treinos",  href: "/player/meus-treinos",  icon: Dumbbell,   desc: "Presenças e sessões" },
  { label: "Pagamentos",       href: "/player/pagamentos",    icon: CreditCard,  desc: "Histórico de quotas" },
  { label: "O Meu Perfil",     href: "/player/conta",         icon: User,        desc: "Dados e foto de perfil" },
  { label: "Preferências",     href: "/player/preferencias",  icon: Settings,    desc: "Notificações e conta" },
];

export default function PlayerMaisPage() {
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
      <h1
        className="font-condensed font-bold text-2xl uppercase tracking-display"
        style={{ color: "var(--ink,#0A1220)" }}
      >
        Mais
      </h1>

      <div className="grid grid-cols-2 gap-3">
        {ITEMS.map(({ label, href, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-2 rounded-2xl p-4 transition-colors active:opacity-70"
            style={{
              background:  "var(--paper,#F6F7F9)",
              border:      "1px solid var(--line,#E4E7EE)",
              touchAction: "manipulation",
              minHeight:   80,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: "var(--action,#F97316)" }} />
            <div>
              <p
                className="text-[14px] font-semibold leading-tight"
                style={{ color: "var(--ink,#0A1220)" }}
              >
                {label}
              </p>
              <p
                className="text-[11px] mt-0.5 leading-tight"
                style={{ color: "var(--muted-text,#5A6478)" }}
              >
                {desc}
              </p>
            </div>
          </Link>
        ))}
      </div>

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
