import { redirect }    from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingClient } from "./landing-client";
import type { Metadata }  from "next";

export const metadata: Metadata = {
  title: "hoophub — Gestão de clubes de basquetebol de veteranos",
  description:
    "Plantel, convocatórias, quotas e estatística de jogo num só sítio. Feito para clubes de basquetebol de veteranos que se gerem a si próprios.",
  robots: { index: true, follow: true },
  openGraph: {
    title:       "hoophub — Gestão de clubes de basquetebol de veteranos",
    description: "Plantel, convocatórias, quotas e estatística de jogo. Feito para veteranos.",
    url:         "https://hoophub.pt",
    siteName:    "hoophub",
    locale:      "pt_PT",
    type:        "website",
  },
};

// Dados públicos do servidor — ISR 10 min
async function getPublicData() {
  try {
    // Usa fetch absoluto para que o Next possa fazer cache ISR
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hoophub.pt";
    const res  = await fetch(`${base}/api/public/home`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  const publicData = await getPublicData();

  return <LandingClient initialData={publicData} />;
}
