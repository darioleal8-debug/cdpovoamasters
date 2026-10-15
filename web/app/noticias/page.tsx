import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notícias",
  description: "Novidades, regulamentos e atualizações sobre basquetebol de veteranos.",
  openGraph: {
    title: "Notícias · hoophub",
    description: "Novidades, regulamentos e atualizações sobre basquetebol de veteranos.",
    url: "https://hoophub.pt/noticias",
  },
};

export const revalidate = 300;

interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  published_at: string;
  is_featured: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const ORANGE      = "#F28C28";
const DARK_ORANGE = "#B26016";
const BLACK       = "#111111";
const GRAY        = "#4B5563";
const LIGHT       = "#F2F4F7";
const BORDER      = "#E5E7EB";

export default async function NoticiasPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select("id, slug, title, excerpt, category, published_at, is_featured")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(30);

  const articles: Article[] = data ?? [];
  const featured = articles.find((a) => a.is_featured) ?? articles[0] ?? null;
  const rest = articles.filter((a) => a.id !== featured?.id);

  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: "48px 24px" }}>
      {/* Page heading */}
      <div style={{ marginBottom: 40 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: DARK_ORANGE,
            marginBottom: 8,
          }}
        >
          Notícias
        </p>
        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 900,
            color: BLACK,
            lineHeight: 1.1,
            letterSpacing: "-0.025em",
          }}
        >
          Basquetebol e o que muda no jogo
        </h1>
      </div>

      {articles.length === 0 && (
        <div
          style={{
            borderRadius: 16,
            background: LIGHT,
            border: `1px solid ${BORDER}`,
            padding: "48px 32px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, color: BLACK }}>
            Sem notícias publicadas ainda.
          </p>
        </div>
      )}

      {/* Featured article */}
      {featured && (
        <Link
          href={`/noticias/${featured.slug}`}
          style={{ textDecoration: "none", display: "block", marginBottom: 32 }}
        >
          <article
            style={{
              borderRadius: 20,
              background: LIGHT,
              border: `1px solid ${BORDER}`,
              padding: "32px 32px",
              transition: "box-shadow 0.15s",
            }}
            className="hover-card"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: "#FFF7ED",
                  color: DARK_ORANGE,
                  border: `1px solid #FDDCB0`,
                  borderRadius: 20,
                  padding: "3px 10px",
                }}
              >
                {featured.category}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  background: ORANGE,
                  color: "#fff",
                  borderRadius: 20,
                  padding: "3px 10px",
                }}
              >
                Destaque
              </span>
            </div>
            <h2
              style={{
                fontSize: "clamp(20px, 3vw, 26px)",
                fontWeight: 900,
                color: BLACK,
                lineHeight: 1.2,
                marginBottom: 12,
                letterSpacing: "-0.02em",
              }}
            >
              {featured.title}
            </h2>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: GRAY,
                marginBottom: 16,
              }}
            >
              {featured.excerpt}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: GRAY }}>
                {formatDate(featured.published_at)}
              </span>
              <span style={{ fontSize: 13, color: DARK_ORANGE, fontWeight: 600 }}>
                Ler artigo →
              </span>
            </div>
          </article>
        </Link>
      )}

      {/* Grid */}
      {rest.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: BLACK,
              marginBottom: 20,
              letterSpacing: "-0.01em",
            }}
          >
            Mais artigos
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {rest.map((article) => (
              <Link
                key={article.id}
                href={`/noticias/${article.slug}`}
                style={{ textDecoration: "none" }}
              >
                <article
                  style={{
                    borderRadius: 16,
                    background: "#fff",
                    border: `1px solid ${BORDER}`,
                    padding: "24px",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: DARK_ORANGE,
                    }}
                  >
                    {article.category}
                  </span>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: BLACK,
                      lineHeight: 1.3,
                      letterSpacing: "-0.01em",
                      flex: 1,
                    }}
                  >
                    {article.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      color: GRAY,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {article.excerpt}
                  </p>
                  <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                    {formatDate(article.published_at)}
                  </p>
                </article>
              </Link>
            ))}
          </div>
        </>
      )}

      <style>{`
        .hover-card:hover { box-shadow: 0 4px 24px rgba(0,0,0,.08); }
      `}</style>
    </div>
  );
}
