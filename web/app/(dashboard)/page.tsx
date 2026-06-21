import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen flex flex-col bg-cdpovoa-blue">
      {/* Cabeçalho */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-800 text-xs font-bold text-white ring-2 ring-white/20">
            CDP
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold uppercase tracking-wide text-white">
              CD Póvoa
            </span>
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-red-400">
              Masters
            </span>
          </div>
        </div>
        <Link
          href="/login"
          className="rounded-md bg-cdpovoa-red px-5 py-2 text-sm font-semibold text-white hover:bg-cdpovoa-red-dark transition-colors"
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-800 text-2xl font-bold text-white ring-4 ring-white/10">
          CDP
        </div>
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          CD Póvoa Masters
        </h1>
        <p className="mb-2 text-lg text-white/60">
          Basquetebol · Póvoa de Varzim
        </p>
        <p className="mb-10 max-w-md text-base text-white/50">
          Plataforma de gestão de jogadores, jogos, pagamentos e estatísticas do clube.
        </p>
        <Link
          href="/login"
          className="rounded-md bg-cdpovoa-red px-8 py-3 text-base font-semibold text-white hover:bg-cdpovoa-red-dark transition-colors shadow-lg"
        >
          Aceder ao painel
        </Link>
      </main>

      {/* Rodapé */}
      <footer className="py-6 text-center text-xs text-white/25">
        © {new Date().getFullYear()} CD Póvoa Masters · Todos os direitos reservados
      </footer>
    </div>
  );
}
