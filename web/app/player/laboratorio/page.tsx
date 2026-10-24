import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPlays } from "@/lib/plays-data";
import { PLAY_CATEGORIES } from "@/types/plays";

export const metadata: Metadata = {
  title: "Laboratório de Jogadas",
  description: "Estuda as jogadas definidas pelo treinador.",
};

export const revalidate = 30;

export default async function PlayerLaboratorioPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { categoria, q } = await searchParams;
  const plays = await getPublishedPlays();

  const filtered = plays.filter((p) => {
    if (categoria && p.category !== categoria) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(24px,6vw,36px)", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>
            Laboratório de <span style={{ color: "var(--club-primary, #F97316)" }}>Jogadas</span>
          </h1>
          <p style={{ fontFamily: "'Barlow', sans-serif", fontSize: 14, color: "rgba(255,255,255,.5)", marginTop: 4 }}>
            {filtered.length} jogada{filtered.length !== 1 ? "s" : ""} publicada{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <form style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <input name="q" defaultValue={q ?? ""} placeholder="Pesquisar…"
          style={{ flex: "1 1 160px", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "inherit", fontFamily: "'Barlow', sans-serif", fontSize: 14 }} />
        <select name="categoria" defaultValue={categoria ?? ""}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "inherit", fontFamily: "'Barlow', sans-serif", fontSize: 14 }}>
          <option value="">Todas</option>
          {PLAY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,.1)", border: "none", color: "inherit", fontFamily: "'Barlow', sans-serif", fontSize: 14, cursor: "pointer" }}>
          Filtrar
        </button>
      </form>

      {filtered.length === 0 ? (
        <p style={{ textAlign: "center", padding: "48px 20px", color: "rgba(255,255,255,.4)", fontFamily: "'Barlow', sans-serif" }}>
          Nenhuma jogada disponível.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {filtered.map((play) => {
            const isNew = play.published_at && now - new Date(play.published_at).getTime() < SEVEN_DAYS;
            return (
              <Link key={play.id} href={`/player/laboratorio/${play.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--club-primary, #F97316)" }}>
                      {play.category}
                    </span>
                    {isNew && (
                      <span style={{ background: "var(--club-primary, #F97316)", color: "#fff", borderRadius: 4, padding: "1px 6px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 10, textTransform: "uppercase" }}>
                        Nova
                      </span>
                    )}
                  </div>
                  <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 20, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0, lineHeight: 1.1 }}>
                    {play.name}
                  </h2>
                  <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12, color: "rgba(255,255,255,.4)" }}>
                    {play.options.length} opç{play.options.length !== 1 ? "ões" : "ão"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
