import Link from "next/link";
import Image from "next/image";
import { createPublicClient } from "@/lib/supabase/public";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Notícias",
  description: "Todas as notícias da Liga INATEL de basquetebol: resultados, análises e reportagens.",
  alternates: {
    canonical: "https://www.hoophub.pt/liga-inatel/noticias",
  },
  openGraph: {
    title: "Notícias · Liga INATEL",
    description: "Todas as notícias da Liga INATEL de basquetebol: resultados, análises e reportagens.",
    url: "https://www.hoophub.pt/liga-inatel/noticias",
    type: "website",
  },
};

const PT_MONTHS = [
  "jan","fev","mar","abr","mai","jun",
  "jul","ago","set","out","nov","dez",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${PT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  cover_image_url: string | null;
  is_featured: boolean;
}

export default async function LigaNoticiasPage() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("news")
    .select("id, slug, title, excerpt, published_at, cover_image_url, is_featured")
    .eq("category", "Liga INATEL")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(40);

  const articles: Article[] = data ?? [];
  const featured = articles.find((a) => a.is_featured) ?? articles[0] ?? null;
  const rest = articles.filter((a) => a.id !== featured?.id);

  return (
    <div style={{ maxWidth: "1024px", margin: "0 auto", padding: "40px 20px 64px" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "32px" }}>
        <p
          style={{
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#F97316",
            margin: "0 0 10px",
          }}
        >
          Liga INATEL · Basquetebol
        </p>
        <h1
          style={{
            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
            fontWeight: 800,
            fontSize: "clamp(28px, 5vw, 42px)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#1A1612",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Notícias
        </h1>
      </div>

      {articles.length === 0 && (
        <div
          style={{
            padding: "48px 32px",
            textAlign: "center",
            background: "rgba(26,22,18,.04)",
            borderRadius: "10px",
            border: "1px solid rgba(26,22,18,.08)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "12px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#8C837A",
              margin: 0,
            }}
          >
            Ainda não há notícias publicadas.
          </p>
        </div>
      )}

      {/* Artigo em destaque */}
      {featured && (
        <Link
          href={`/liga-inatel/noticias/${featured.slug}`}
          style={{ textDecoration: "none", display: "block", marginBottom: "32px" }}
        >
          <article
            style={{
              borderRadius: "10px",
              overflow: "hidden",
              background: "#FFFDFA",
              boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 32px -8px rgba(26,22,18,.18)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              minHeight: "220px",
            }}
            className="liga-featured-article"
          >
            {/* Texto */}
            <div style={{ padding: "32px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-ibm-mono, monospace)",
                      fontSize: "9px",
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      background: "#F97316",
                      color: "#fff",
                      borderRadius: "3px",
                      padding: "3px 8px",
                    }}
                  >
                    Destaque
                  </span>
                </div>
                <h2
                  style={{
                    fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                    fontWeight: 800,
                    fontSize: "clamp(20px, 2.5vw, 26px)",
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    color: "#1A1612",
                    lineHeight: 1.15,
                    margin: "0 0 12px",
                  }}
                >
                  {featured.title}
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-barlow, sans-serif)",
                    fontSize: "14px",
                    color: "#3D3630",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {featured.excerpt}
                </p>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "10px",
                  color: "#8C837A",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  margin: "20px 0 0",
                }}
              >
                {fmtDate(featured.published_at)} · Ler artigo →
              </p>
            </div>
            {/* Imagem */}
            <div style={{ position: "relative", minHeight: "220px" }}>
              {featured.cover_image_url ? (
                <Image
                  src={featured.cover_image_url}
                  alt={featured.title}
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="(max-width: 768px) 100vw, 512px"
                  priority
                />
              ) : (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(135deg, #F97316 0%, #C2530A 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                    fontWeight: 900, fontSize: "28px",
                    letterSpacing: "0.08em", color: "#fff",
                    textTransform: "uppercase",
                  }}>
                    hoophub
                  </span>
                </div>
              )}
            </div>
          </article>
        </Link>
      )}

      {/* Grid de artigos */}
      {rest.length > 0 && (
        <>
          <h2
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#8C837A",
              margin: "0 0 16px",
            }}
          >
            Todas as notícias
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {rest.map((article) => (
              <Link
                key={article.id}
                href={`/liga-inatel/noticias/${article.slug}`}
                style={{ textDecoration: "none" }}
              >
                <article
                  style={{
                    borderRadius: "8px",
                    overflow: "hidden",
                    background: "#FFFDFA",
                    boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 4px 16px -6px rgba(26,22,18,.12)",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", flexShrink: 0 }}>
                    {article.cover_image_url ? (
                      <Image
                        src={article.cover_image_url}
                        alt={article.title}
                        fill
                        style={{ objectFit: "cover" }}
                        sizes="(max-width: 600px) 100vw, 320px"
                        loading="lazy"
                      />
                    ) : (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "linear-gradient(135deg, #F97316 0%, #C2530A 100%)",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: "4px",
                      }}>
                        <span style={{
                          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                          fontWeight: 900, fontSize: "18px",
                          letterSpacing: "0.06em", color: "#fff", textTransform: "uppercase",
                        }}>hoophub</span>
                        <span style={{
                          fontFamily: "var(--font-ibm-mono, monospace)",
                          fontSize: "7px", fontWeight: 600,
                          letterSpacing: "0.12em", color: "rgba(255,255,255,.7)",
                          textTransform: "uppercase",
                        }}>Liga INATEL</span>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: "16px 18px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <p
                      style={{
                        fontFamily: "var(--font-ibm-mono, monospace)",
                        fontSize: "9px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "#8C837A",
                        margin: "0 0 8px",
                      }}
                    >
                      {fmtDate(article.published_at)}
                    </p>
                    <h3
                      style={{
                        fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                        fontWeight: 800,
                        fontSize: "16px",
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        color: "#1A1612",
                        lineHeight: 1.2,
                        margin: "0 0 8px",
                        flex: 1,
                      }}
                    >
                      {article.title}
                    </h3>
                    <p
                      style={{
                        fontFamily: "var(--font-barlow, sans-serif)",
                        fontSize: "12px",
                        color: "#6F675F",
                        lineHeight: 1.55,
                        margin: "0 0 14px",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden",
                      }}
                    >
                      {article.excerpt}
                    </p>
                    <span
                      style={{
                        fontFamily: "var(--font-barlow-condensed, sans-serif)",
                        fontWeight: 700,
                        fontSize: "11px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#C2530A",
                      }}
                    >
                      Ler mais →
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 640px) {
          .liga-featured-article { grid-template-columns: 1fr !important; }
          .liga-featured-article > div:last-child { min-height: 180px; order: -1; }
        }
      `}</style>
    </div>
  );
}
