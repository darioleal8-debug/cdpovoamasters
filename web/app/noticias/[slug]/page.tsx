import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markdownToHtml } from "@/lib/markdown";
import type { Metadata } from "next";

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

async function getArticle(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select("id, slug, title, excerpt, body, category, published_at, is_featured, cover_image_url")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Artigo não encontrado" };

  return {
    title: article.title,
    description: article.excerpt,
    openGraph: {
      title: `${article.title} · hoophub`,
      description: article.excerpt,
      url: `https://hoophub.pt/noticias/${slug}`,
      type: "article",
      publishedTime: article.published_at,
      ...(article.cover_image_url
        ? { images: [{ url: article.cover_image_url, width: 1200, height: 675, alt: article.title }] }
        : {}),
    },
  };
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
const BORDER      = "#E5E7EB";
const LIGHT       = "#F2F4F7";

function NewsImageFallback({ title }: { title: string }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "linear-gradient(135deg, #F28C28 0%, #B26016 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px", gap: "10px",
    }}>
      <span style={{
        fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
        fontWeight: 900, fontSize: "clamp(28px, 6vw, 48px)",
        letterSpacing: "0.06em", color: "#fff",
        textTransform: "uppercase", lineHeight: 1,
      }}>hoophub</span>
      <span style={{
        fontFamily: "var(--font-ibm-mono, monospace)",
        fontSize: "11px", fontWeight: 600,
        letterSpacing: "0.14em", color: "rgba(255,255,255,.75)",
        textTransform: "uppercase",
      }}>Liga INATEL</span>
      <p style={{
        fontFamily: "var(--font-barlow-condensed, sans-serif)",
        fontSize: "clamp(14px, 2.5vw, 20px)", fontWeight: 700,
        color: "rgba(255,255,255,.9)", textAlign: "center",
        maxWidth: "80%", margin: 0, lineHeight: 1.3,
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const,
      }}>{title}</p>
    </div>
  );
}

export default async function NoticiaDetailPage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const bodyHtml = markdownToHtml(article.body);

  const isLiga = article.category === "Liga INATEL";
  const backHref = isLiga ? "/liga-inatel" : "/noticias";
  const backLabel = isLiga ? "← Liga INATEL" : "← Notícias";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 8 }}>
        <Link
          href={backHref}
          style={{ fontSize: 14, color: DARK_ORANGE, textDecoration: "none", fontWeight: 500 }}
        >
          {backLabel}
        </Link>
        {isLiga && (
          <>
            <span style={{ fontSize: 14, color: GRAY }}>·</span>
            <Link
              href="/noticias"
              style={{ fontSize: 14, color: GRAY, textDecoration: "none", fontWeight: 500 }}
            >
              Notícias
            </Link>
          </>
        )}
      </nav>

      {/* Header */}
      <header style={{ marginBottom: 40 }}>
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
            {article.category}
          </span>
          {article.is_featured && (
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
          )}
        </div>

        <h1
          style={{
            fontSize: "clamp(26px, 4.5vw, 36px)",
            fontWeight: 900,
            color: BLACK,
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            marginBottom: 16,
          }}
        >
          {article.title}
        </h1>

        <p
          style={{
            fontSize: 17,
            lineHeight: 1.65,
            color: GRAY,
            borderLeft: `3px solid ${ORANGE}`,
            paddingLeft: 16,
            marginBottom: 16,
          }}
        >
          {article.excerpt}
        </p>

        <p style={{ fontSize: 13, color: "#9CA3AF" }}>
          {formatDate(article.published_at)}
        </p>
      </header>

      {/* Imagem de destaque */}
      <div style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        borderRadius: "12px",
        overflow: "hidden",
        marginBottom: 32,
        background: article.cover_image_url ? undefined : "#F28C28",
      }}>
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
          <NewsImageFallback title={article.title} />
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, marginBottom: 32 }} />

      {/* Body */}
      <div
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
        style={{ fontSize: 15, lineHeight: 1.75, color: GRAY }}
      />

      {/* Footer nav */}
      <div
        style={{
          marginTop: 56,
          paddingTop: 24,
          borderTop: `1px solid ${BORDER}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link
          href={backHref}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: DARK_ORANGE,
            textDecoration: "none",
          }}
        >
          {isLiga ? "← Voltar à Liga INATEL" : "← Ver todas as notícias"}
        </Link>
        <Link
          href="/pedir-acesso"
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 12,
            padding: "10px 20px",
            background: ORANGE,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Pedir acesso ao hoophub
        </Link>
      </div>

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
            publisher: {
              "@type": "Organization",
              name: "hoophub",
              url: "https://hoophub.pt",
            },
          }),
        }}
      />

      <style>{`
        /* Ensure inline styles from markdown renderer render correctly */
        a { transition: opacity 0.15s; }
        a:hover { opacity: 0.7; }
      `}</style>

      {/* Not-visible placeholder to ensure Tailwind does not purge nothing */}
      <div style={{ display: "none" }} aria-hidden />
    </div>
  );
}
