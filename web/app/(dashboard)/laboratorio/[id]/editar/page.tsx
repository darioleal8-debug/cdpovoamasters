import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlayEditor } from "@/lib/plays/require-editor";
import { getPlay } from "@/lib/plays-data";
import { PlayEditor } from "@/components/plays/play-editor";

export const metadata = { title: "Editar jogada · Laboratório" };

export default async function EditarJogadaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlayEditor();
  const { id } = await params;
  const play = await getPlay(id);
  if (!play) notFound();
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 6, marginBottom: 20, fontSize: 13, color: "var(--muted-foreground)" }}>
        <Link href="/laboratorio" style={{ color: "var(--action, #F97316)", textDecoration: "none" }}>Laboratório</Link>
        <span>/</span><Link href={`/laboratorio/${id}`} style={{ color: "inherit" }}>{play.name}</Link><span>/</span><span>Editar</span>
      </nav>
      <PlayEditor
        playId={id}
        initialPlay={{ name: play.name, eyebrow: play.eyebrow ?? null, category: play.category, note: play.note ?? null, init: play.init, steps: play.steps, options: play.options }}
        initialStatus={play.status}
        initialPrompt={play.ai_prompt}
        initialHistory={play.ai_history}
      />
    </div>
  );
}
