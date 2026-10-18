"use client";

import { useState } from "react";
import { Check, ChevronDown, Repeat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";

const ROLE_LABELS: Record<string, string> = {
  admin:       "Administrador",
  treinador:   "Treinador",
  jogador:     "Jogador",
  seccionista: "Seccionista",
  tesoureiro:  "Tesoureiro",
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

/** Troca o papel ativo e recarrega na página inicial desse papel (o estado do cliente depende do papel). */
function useSwitchRole() {
  const [pending, setPending] = useState(false);
  async function switchTo(role: string) {
    setPending(true);
    try {
      const res = await fetch("/api/auth/active-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível mudar de papel.");
      window.location.assign(data.home ?? "/dashboard");
    } catch (e) {
      setPending(false);
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  }
  return { pending, switchTo };
}

/** Itens para dentro de um DropdownMenuContent existente (menu do utilizador no dashboard). */
export function RoleSwitcherItems({ roles, activeRole }: { roles: string[]; activeRole: string }) {
  const { pending, switchTo } = useSwitchRole();
  if (roles.length < 2) return null;
  return (
    <>
      <DropdownMenuSeparator className="bg-gray-100 my-1" />
      <DropdownMenuLabel className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Usar como
      </DropdownMenuLabel>
      {roles.map((r) => (
        <DropdownMenuItem
          key={r}
          disabled={pending}
          onClick={() => r !== activeRole && switchTo(r)}
          className="cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          style={{ minHeight: 44 }}
        >
          {r === activeRole
            ? <Check className="mr-2 h-4 w-4 text-gray-900" />
            : <span className="mr-2 inline-block h-4 w-4" />}
          {roleLabel(r)}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Botão compacto com menu próprio (área do jogador, fundo escuro). */
export function RoleSwitcherChip({ roles, activeRole }: { roles: string[]; activeRole: string }) {
  const { pending, switchTo } = useSwitchRole();
  if (roles.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/5"
          style={{ minHeight: 36 }}
          aria-label="Mudar de papel"
        >
          <Repeat className="h-3.5 w-3.5" />
          {roleLabel(activeRole)}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 bg-white border border-gray-200 shadow-xl rounded-xl p-1">
        <DropdownMenuLabel className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Usar como
        </DropdownMenuLabel>
        {roles.map((r) => (
          <DropdownMenuItem
            key={r}
            disabled={pending}
            onClick={() => r !== activeRole && switchTo(r)}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            style={{ minHeight: 44 }}
          >
            {r === activeRole
              ? <Check className="mr-2 h-4 w-4 text-gray-900" />
              : <span className="mr-2 inline-block h-4 w-4" />}
            {roleLabel(r)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
