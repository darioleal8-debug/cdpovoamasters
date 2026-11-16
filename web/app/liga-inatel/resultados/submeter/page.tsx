import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// A submissão de resultados só é feita na Área de equipa (delegados autenticados).
// Este endereço é o que o Master admin partilha por WhatsApp: se o delegado ainda não
// tem sessão, passa pelo login e volta ao jogo indicado.
export default async function SubmeterResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  const target = `/liga-inatel/equipa${jogo ? `?jogo=${encodeURIComponent(jogo)}` : ""}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/liga-inatel/equipa/login?redirect=${encodeURIComponent(target)}`);
  }

  redirect(`${target}#resultados`);
}
