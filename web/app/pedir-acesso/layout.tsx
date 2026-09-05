import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pedir acesso — hoophub",
  description: "Pede acesso ao hoophub para o teu clube de basquetebol. Respondemos em 48 horas.",
  robots: { index: true, follow: true },
};

export default function PedirAcessoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
