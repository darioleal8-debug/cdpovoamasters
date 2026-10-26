import { redirect } from "next/navigation";

// A submissão de resultados só é feita na Área de equipa (delegados autenticados).
// Este endereço antigo mantém-se apenas para encaminhar links já partilhados.
export default async function SubmeterResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const { jogo } = await searchParams;
  const qs = jogo ? `?jogo=${encodeURIComponent(jogo)}` : "";
  redirect(`/liga-inatel/equipa${qs}#resultados`);
}
