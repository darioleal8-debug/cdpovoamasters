import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlay } from "@/lib/plays-data";
import type { UserRole } from "@/types/database";
import { readActiveRoleCookie } from "@/lib/auth/guards";
import { applyActiveRole } from "@/lib/auth/active-role";
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

export default async function PlayPage({
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

  const { data: profile } = await supabase
    .from("users")
    .select("role, roles_extra, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active) redirect("/login?reason=inactive");

  const effective = applyActiveRole(
    { role: profile.role as UserRole, roles_extra: profile.roles_extra },
    await readActiveRoleCookie()
  );
  const isEditor =
    effective.role === "admin" ||
    effective.role === "treinador" ||
    (effective.roles_extra ?? []).some((r: string) =>
      ["admin", "treinador"].includes(r)
    );

  const play = await getPlay(id);
  if (!play) notFound();
  if (play.status === "draft" && !isEditor) notFound();

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
          color: "var(--muted-foreground)",
        }}
      >
        <Link href="/laboratorio" style={{ color: "var(--action, #F97316)", textDecoration: "none" }}>
          Laboratório
        </Link>
        <span>/</span>
        <span>{play.name}</span>
        {isEditor && (
          <>
            <span style={{ marginLeft: "auto" }} />
            <Link
              href={`/laboratorio/${id}/editar`}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                color: "inherit",
                textDecoration: "none",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 600,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Editar
            </Link>
          </>
        )}
      </nav>

      {/* Viewer */}
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
