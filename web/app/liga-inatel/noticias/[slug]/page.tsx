import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markdownToHtml } from "@/lib/markdown";
import type { Metadata } from "next";
import { ShareButtons } from "./_share-buttons";
import { GamePhotoGallery } from "@/components/liga/game-photo-gallery";
import type { GalleryPhoto } from "@/components/liga/game-photo-gallery";

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

async function getArticle(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select("id, slug, title, excerpt, body, category, published_at, cover_image_url, game_id, cover_photo_id")
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("category", "Liga INATEL")
    .single();
  return data;
}

async function getGalleryPhotos(gameId: string, coverPhotoId: string | null): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  // RLS enforces hidden=false; we skip the cover photo (it is shown above the article)
  const { data: photos } = await supabase
    .from("game_photos")
    .select("id, storage_path, caption, team_id")
    .eq("game_id", gameId)
    .neq("id", coverPhotoId ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: true });

  if (!photos || photos.length === 0) return [];

  const teamIds = [...new Set(photos.map((p) => p.team_id))];
  const { data: teams } = await supabase.from("league_teams").select("id, name").in("id", teamIds);
  const teamMap: Record<string, string> = {};
  for (const t of teams ?? []) teamMap[t.id] = t.name;

  return photos.map((p) => {
    const { data: pub } = supabase.storage.from("game-photos").getPublicUrl(p.storage_path);
    return {
      id: p.id,
      public_url: pub.publicUrl,
      caption: p.caption ?? null,
      team_name: teamMap[p.team_id] ?? "Equipa",
    };
  });
}

async function getRelated(currentId: string, limit = 3) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select("id, slug, title, cover_image_url, published_at")
    .eq("category", "Liga INATEL")
    .eq("is_published", true)
    .neq("id", currentId)
    .order("published_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Artigo não encontrado" };

  const canonicalUrl = `https://www.hoophub.pt/liga-inatel/noticias/${slug}`;

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${article.title} · Liga INATEL`,
      description: article.excerpt,
      url: canonicalUrl,
      type: "article",
      publishedTime: article.published_at ?? undefined,
      ...(article.cover_image_url
        ? { images: [{ url: article.cover_image_url, width: 1200, height: 675, alt: article.title }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${article.title} · Liga INATEL`,
      description: article.excerpt,
      ...(article.cover_image_url ? { images: [article.cover_image_url] } : {}),
    },
  };
}

const PT_MONTHS_LONG = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} de ${PT_MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

export default async function LigaNoticiaDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const [bodyHtml, related, galleryPhotos] = await Promise.all([
    Promise.resolve(markdownToHtml(article.body)),
    getRelated(article.id),
    article.game_id
      ? getGalleryPhotos(article.game_id, (article as { cover_photo_id?: string | null }).cover_photo_id ?? null)
      : Promise.resolve([] as GalleryPhoto[]),
  ]);

  const canonicalUrl = `https://www.hoophub.pt/liga-inatel/noticias/${slug}`;

  return (
    <>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 20px 64px" }}>

        {/* Breadcrumb */}
        <nav
          style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "28px", flexWrap: "wrap" }}
          aria-label="Navegação"
        >
          <Link href="/liga-inatel" style={{ fontSize: "12px", color: "#8C837A", textDecoration: "none" }}>
            Liga INATEL
          </Link>
          <span style={{ fontSize: "12px", color: "#8C837A" }}>›</span>
          <Link href="/liga-inatel/noticias" style={{ fontSize: "12px", color: "#8C837A", textDecoration: "none" }}>
            Notícias
          </Link>
          <span style={{ fontSize: "12px", color: "#8C837A" }}>›</span>
          <span
            style={{
              fontSize: "12px",
              color: "#3D3630",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "200px",
            }}
          >
            {article.title}
          </span>
        </nav>

        {/* Cabeçalho do artigo */}
        <header style={{ marginBottom: "32px" }}>
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#F97316",
              margin: "0 0 14px",
            }}
          >
            Liga INATEL · {fmtDate(article.published_at)}
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 800,
              fontSize: "clamp(26px, 5vw, 40px)",
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              color: "#1A1612",
              lineHeight: 1.1,
              margin: "0 0 18px",
            }}
          >
            {article.title}
          </h1>
          <p
            style={{
              fontFamily: "var(--font-barlow, sans-serif)",
              fontSize: "17px",
              lineHeight: 1.65,
              color: "#3D3630",
              borderLeft: "3px solid #F97316",
              paddingLeft: "16px",
              margin: 0,
            }}
          >
            {article.excerpt}
          </p>
        </header>

        {/* Imagem de capa */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16/9",
            borderRadius: "10px",
            overflow: "hidden",
            marginBottom: "32px",
          }}
        >
          {article.cover_image_url ? (
            <Image
              src={article.cover_image_url}
              alt={article.title}
              fill
              style={{ objectFit: "cover" }}
              sizes="(max-width: 720px) 100vw, 720px"
              priority
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(135deg, #F97316 0%, #C2530A 100%)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              <span style={{
                fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                fontWeight: 900, fontSize: "clamp(28px, 6vw, 48px)",
                letterSpacing: "0.06em", color: "#fff", textTransform: "uppercase",
              }}>hoophub</span>
              <span style={{
                fontFamily: "var(--font-ibm-mono, monospace)",
                fontSize: "11px", fontWeight: 600,
                letterSpacing: "0.14em", color: "rgba(255,255,255,.75)", textTransform: "uppercase",
              }}>Liga INATEL</span>
            </div>
          )}
        </div>

        {/* Corpo do artigo */}
        <div
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
          className="liga-article-body"
        />

        {/* Galeria de fotografias do jogo */}
        {galleryPhotos.length > 0 && (
          <div style={{ marginTop: "40px" }}>
            <p
              style={{
                fontFamily: "var(--font-ibm-mono, monospace)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#8C837A",
                margin: "0 0 12px",
              }}
            >
              Fotos do jogo
            </p>
            <GamePhotoGallery photos={galleryPhotos} />
          </div>
        )}

        {/* Partilhar */}
        <div
          style={{
            marginTop: "40px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(26,22,18,.1)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#8C837A",
              margin: "0 0 12px",
            }}
          >
            Partilhar
          </p>
          <ShareButtons url={canonicalUrl} title={article.title} />
        </div>

        {/* CTAs de navegação */}
        <div
          style={{
            marginTop: "40px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "10px",
          }}
        >
          <Link
            href="/liga-inatel/noticias"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 16px",
              borderRadius: "6px",
              background: "rgba(26,22,18,.05)",
              border: "1px solid rgba(26,22,18,.1)",
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "#3D3630",
              textDecoration: "none",
            }}
          >
            ← Notícias
          </Link>
          <Link
            href="/liga-inatel/classificacao"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 16px",
              borderRadius: "6px",
              background: "rgba(26,22,18,.05)",
              border: "1px solid rgba(26,22,18,.1)",
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "#3D3630",
              textDecoration: "none",
            }}
          >
            Classificação
          </Link>
          <Link
            href="/liga-inatel/calendario"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 16px",
              borderRadius: "6px",
              background: "#F97316",
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 700,
              fontSize: "12px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "#15110E",
              textDecoration: "none",
            }}
          >
            Calendário
          </Link>
        </div>
      </div>

      {/* Mais notícias */}
      {related.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(26,22,18,.1)",
            padding: "40px 20px 64px",
            background: "rgba(26,22,18,.02)",
          }}
        >
          <div style={{ maxWidth: "1024px", margin: "0 auto" }}>
            <h2
              style={{
                fontFamily: "var(--font-ibm-mono, monospace)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#8C837A",
                margin: "0 0 20px",
              }}
            >
              Mais notícias
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "16px",
              }}
            >
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/liga-inatel/noticias/${r.slug}`}
                  style={{ textDecoration: "none" }}
                >
                  <article
                    style={{
                      borderRadius: "8px",
                      overflow: "hidden",
                      background: "#FFFDFA",
                      boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 4px 16px -6px rgba(26,22,18,.12)",
                    }}
                  >
                    {r.cover_image_url && (
                      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9" }}>
                        <Image
                          src={r.cover_image_url}
                          alt={r.title}
                          fill
                          style={{ objectFit: "cover" }}
                          sizes="(max-width: 600px) 100vw, 320px"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div style={{ padding: "14px 16px 18px" }}>
                      <h3
                        style={{
                          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                          fontWeight: 800,
                          fontSize: "15px",
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                          color: "#1A1612",
                          lineHeight: 1.2,
                          margin: "0 0 6px",
                        }}
                      >
                        {r.title}
                      </h3>
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
                        Ler →
                      </span>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            headline: article.title,
            description: article.excerpt,
            datePublished: article.published_at,
            dateModified: article.published_at,
            url: canonicalUrl,
            ...(article.cover_image_url ? { image: article.cover_image_url } : {}),
            publisher: {
              "@type": "Organization",
              name: "hoophub",
              url: "https://www.hoophub.pt",
            },
          }),
        }}
      />

      <style>{`
        .liga-article-body {
          font-family: var(--font-barlow, sans-serif);
          font-size: 16px;
          line-height: 1.75;
          color: #3D3630;
        }
        .liga-article-body h2 {
          font-family: var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif));
          font-size: 22px; font-weight: 800;
          letter-spacing: 0.04em; text-transform: uppercase;
          color: #1A1612; margin: 32px 0 14px;
        }
        .liga-article-body h3 {
          font-size: 18px; font-weight: 700; color: #1A1612; margin: 24px 0 10px;
        }
        .liga-article-body p { margin: 0 0 18px; }
        .liga-article-body a { color: #C2530A; }
        .liga-article-body strong { color: #1A1612; }
        .liga-article-body ul, .liga-article-body ol { padding-left: 22px; margin: 0 0 18px; }
        .liga-article-body li { margin-bottom: 6px; }
        .liga-article-body blockquote {
          border-left: 3px solid #F97316; margin: 0 0 18px;
          padding-left: 16px; color: #6F675F; font-style: italic;
        }
      `}</style>
    </>
  );
}
