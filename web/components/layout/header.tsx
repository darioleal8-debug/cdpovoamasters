"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu, User } from "lucide-react";
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
  userName: string;
  userEmail: string;
  userRole: string;
  onMenuToggle?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  treinador: "Treinador",
  jogador: "Jogador",
  seccionista: "Seccionista",
};

export function Header({ userName, userEmail, userRole, onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: "Sessão terminada", description: "Até breve!" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b bg-white px-6">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuToggle}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Breadcrumb / título vazio no desktop (pode ser expandido) */}
      <div className="hidden lg:block" />

      {/* Utilizador */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex h-auto items-center gap-3 px-2 py-1.5">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-cdpovoa-blue text-xs text-white" style={{ backgroundColor: "var(--club-primary, #111111)" }}>
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden flex-col items-start text-left sm:flex">
              <span className="text-sm font-medium">{userName}</span>
              <span className="text-xs text-muted-foreground">
                {ROLE_LABELS[userRole] ?? userRole}
              </span>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 bg-white border border-gray-200 shadow-xl rounded-xl p-1"
        >
          <DropdownMenuLabel className="font-normal px-3 py-2">
            <div className="flex flex-col space-y-0.5">
              <p className="text-sm font-semibold text-gray-900">{userName}</p>
              <p className="text-xs text-gray-500">{userEmail}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-100 my-1" />
          <DropdownMenuItem
            onClick={() => router.push("/configuracoes")}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100"
          >
            <User className="mr-2 h-4 w-4 text-gray-500" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-gray-100 my-1" />
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
