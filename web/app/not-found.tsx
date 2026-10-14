import Link from "next/link";
import { Home } from "lucide-react";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <p className="text-6xl font-bold text-muted-foreground/30">404</p>
        <h1 className="text-2xl font-bold tracking-tight">Página não encontrada</h1>
        <p className="text-muted-foreground max-w-sm">
          O endereço que visitaste não existe ou foi removido.
        </p>
      </div>
      <Link
        href="/login"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Home className="h-4 w-4" />
        Ir para o início
      </Link>
    </div>
  );
}
