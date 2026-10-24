import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlay } from "@/lib/plays-data";
import { PlayViewer } from "@/components/plays/play-viewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const play = await getPlay(id);
  return { title: play ? `${play.name} · Laboratório` : "Jogada não encontrada" };
}

export const revalidate = 30;

export default async function PlayerPlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const play = await getPlay(id);
  if (!play || play.status !== "published") notFound();

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <nav
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          marginBottom: 24,
          fontFamily: "'Barlow', sans-serif",
          fontSize: 13,
          color: "rgba(255,255,255,.5)",
        }}
      >
        <Link
          href="/player/laboratorio"
          style={{ color: "var(--club-primary, #F97316)", textDecoration: "none" }}
        >
          Laboratório
        </Link>
        <span>/</span>
        <span>{play.name}</span>
      </nav>

      <PlayViewer
        name={play.name}
        eyebrow={play.eyebrow}
        note={play.note}
        init={play.init}
        steps={play.steps}
        options={play.options}
      />
    </div>
  );
}
