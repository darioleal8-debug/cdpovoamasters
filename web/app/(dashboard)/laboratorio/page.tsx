import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllPlays, getPublishedPlays, getStudiedCounts } from "@/lib/plays-data";
import { PLAY_CATEGORIES } from "@/types/plays";
import type { UserRole } from "@/types/database";
import { readActiveRoleCookie } from "@/lib/auth/guards";
import { applyActiveRole } from "@/lib/auth/active-role";

export const metadata: Metadata = {
  title: "Laboratório de Jogadas",
  description: "Portfólio de jogadas animadas para estudo tático.",
};

export const revalidate = 30;

export default async function LaboratorioPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
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

  const { categoria, q } = await searchParams;

  const plays = isEditor
    ? await getAllPlays()
    : await getPublishedPlays();

  const studiedCounts = await getStudiedCounts(plays.map((p) => p.id));

  const filtered = plays.filter((p) => {
    if (categoria && p.category !== categoria) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "clamp(28px,6vw,40px)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              margin: 0,
            }}
          >
            Laboratório de{" "}
            <span style={{ color: "var(--action, #F97316)" }}>Jogadas</span>
          </h1>
          <p
            style={{
              fontFamily: "'Barlow', sans-serif",
              fontSize: 14,
              color: "var(--muted-foreground)",
              marginTop: 4,
            }}
          >
            {filtered.length} jogada{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isEditor && (
          <Link
            href="/laboratorio/nova"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 8,
              background: "var(--action, #F97316)",
              color: "#fff",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              textDecoration: "none",
            }}
          >
            + Nova jogada
          </Link>
        )}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <form style={{ display: "contents" }}>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Pesquisar jogada…"
            style={{
              flex: "1 1 180px",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontFamily: "'Barlow', sans-serif",
              fontSize: 14,
            }}
          />
          <select
            name="categoria"
            defaultValue={categoria ?? ""}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontFamily: "'Barlow', sans-serif",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <option value="">Todas as categorias</option>
            {PLAY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: "var(--muted)",
              border: "none",
              fontFamily: "'Barlow', sans-serif",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Filtrar
          </button>
        </form>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p
          style={{
            textAlign: "center",
            padding: "48px 20px",
            color: "var(--muted-foreground)",
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          Nenhuma jogada encontrada.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((play) => {
            const isNew =
              play.published_at &&
              now - new Date(play.published_at).getTime() < SEVEN_DAYS;
            const studied = studiedCounts[play.id] ?? 0;

            return (
              <Link
                key={play.id}
                href={`/laboratorio/${play.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    transition: "box-shadow .15s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontWeight: 700,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: "var(--action, #F97316)",
                      }}
                    >
                      {play.category}
                    </span>
                    {isNew && (
                      <span
                        style={{
                          background: "var(--action, #F97316)",
                          color: "#fff",
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontWeight: 700,
                          fontSize: 10,
                          textTransform: "uppercase",
                        }}
                      >
                        Nova
                      </span>
                    )}
                    {isEditor && play.status === "draft" && (
                      <span
                        style={{
                          background: "var(--muted)",
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontWeight: 600,
                          fontSize: 10,
                          textTransform: "uppercase",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        Rascunho
                      </span>
                    )}
                  </div>

                  <h2
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontWeight: 800,
                      fontSize: 22,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      margin: 0,
                      lineHeight: 1.1,
                    }}
                  >
                    {play.name}
                  </h2>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Barlow', sans-serif",
                        fontSize: 12,
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {play.options.length} opção
                      {play.options.length !== 1 ? "ões" : ""}
                    </span>
                    {isEditor && studied > 0 && (
                      <span
                        style={{
                          fontFamily: "'Barlow', sans-serif",
                          fontSize: 12,
                          color: "var(--muted-foreground)",
                        }}
                      >
                        {studied} estudad{studied !== 1 ? "as" : "a"}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
