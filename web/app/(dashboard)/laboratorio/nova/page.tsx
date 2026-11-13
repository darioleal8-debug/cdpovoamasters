import Link from "next/link";
import { requirePlayEditor } from "@/lib/plays/require-editor";
import { PlayEditor } from "@/components/plays/play-editor";

export const metadata = { title: "Nova jogada · Laboratório" };

export default async function NovaJogadaPage() {
  await requirePlayEditor();
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <nav style={{ display: "flex", gap: 6, marginBottom: 20, fontSize: 13, color: "var(--muted-foreground)" }}>
        <Link href="/laboratorio" style={{ color: "var(--action, #F97316)", textDecoration: "none" }}>Laboratório</Link>
        <span>/</span><span>Nova jogada</span>
      </nav>
      <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 32, textTransform: "uppercase", margin: "0 0 16px" }}>
        Nova <span style={{ color: "var(--action, #F97316)" }}>jogada</span>
      </h1>
      <PlayEditor />
    </div>
  );
}
