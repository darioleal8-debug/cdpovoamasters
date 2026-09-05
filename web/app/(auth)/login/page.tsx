import type { Metadata } from "next";
import Link from "next/link";
import { LoginPanelLeft } from "@/components/auth/login-panel-left";
import { LoginForm }      from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar — hoophub",
  description: "Acede ao hoophub com o teu email e palavra-passe.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="flex" style={{ minHeight: "100dvh" }}>

      {/* ── Painel esquerdo (58%, só desktop) ── */}
      <LoginPanelLeft />

      {/* ── Painel direito (42% desktop, 100% mobile) ── */}
      <div
        className="flex flex-1 lg:w-[42%] lg:flex-none flex-col items-center justify-center px-8 py-12"
        style={{ background: "#ffffff", minHeight: "100dvh" }}
      >
        {/* Topo mobile: logo hoophub */}
        <div className="lg:hidden flex items-center gap-3 mb-10 self-start">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white font-black"
            style={{ background: "#F28C28", fontSize: 16 }}
            aria-hidden="true"
          >
            ◉
          </span>
          <span className="font-black text-[20px]" style={{ color: "#111111" }}>
            hoop<span style={{ color: "#F28C28" }}>hub</span>
          </span>
        </div>

        {/* Formulário */}
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1
              className="font-black text-[32px] leading-none mb-2"
              style={{ color: "#111111", letterSpacing: "-.02em" }}
            >
              Entrar
            </h1>
            <p className="text-[14px]" style={{ color: "#5A6478" }}>
              Acesso de jogadores e equipa técnica.
            </p>
          </div>
          <LoginForm />
          <p className="mt-6 text-center text-[13px]" style={{ color: "#9CA3AF" }}>
            Novo no hoophub?{" "}
            <Link href="/pedir-acesso" className="font-semibold hover:opacity-70 transition-opacity" style={{ color: "#B26016" }}>
              Pedir acesso para o meu clube
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
