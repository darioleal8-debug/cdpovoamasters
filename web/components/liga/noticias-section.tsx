import Link from "next/link";
import Image from "next/image";
import type { NoticiaPublic } from "@/lib/competitions-data";

const PT_MONTHS_LONG = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} de ${PT_MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

export function NoticiasSection({ noticias }: { noticias: NoticiaPublic[] }) {
  const isEmpty = noticias.length === 0;

  return (
    <section
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "48px 20px 0",
      }}
    >
      {/* Título */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
          paddingBottom: "10px",
          borderBottom: "3px solid #1A1612",
          marginBottom: "20px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
            fontWeight: 800,
            fontSize: "clamp(22px, 4vw, 30px)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#1A1612",
            lineHeight: 1,
          }}
        >
          Últimas notícias
        </span>
        <Link
          href="/liga-inatel/noticias"
          style={{
            fontFamily: "var(--font-barlow-condensed, sans-serif)",
            fontWeight: 600,
            fontSize: "13px",
            letterSpacing: "0.04em",
            color: "#C2530A",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Todas →
        </Link>
      </div>

      {/* Artigos ou estado vazio */}
      {isEmpty ? (
        <div
          style={{
            padding: "32px 0",
            textAlign: "center",
            color: "#8C837A",
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "12px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          As notícias aparecem aqui após cada resultado aprovado.
        </div>
      ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {noticias.map((n, i) => (
          <Link
            key={n.id}
            href={`/liga-inatel/noticias/${n.slug}`}
            style={{ textDecoration: "none" }}
          >
          <article
            style={{
              background: "#FFFDFA",
              borderRadius: "8px",
              boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.2)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
            {/* Thumbnail 16:9 */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", flexShrink: 0 }}>
              {n.cover_image_url ? (
                <Image
                  src={n.cover_image_url}
                  alt={n.title}
                  fill
                  style={{ objectFit: "cover" }}
                  sizes="(max-width: 600px) 100vw, 360px"
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
                    fontWeight: 900, fontSize: "20px",
                    letterSpacing: "0.06em", color: "#fff", textTransform: "uppercase",
                  }}>hoophub</span>
                  <span style={{
                    fontFamily: "var(--font-ibm-mono, monospace)",
                    fontSize: "8px", fontWeight: 600,
                    letterSpacing: "0.12em", color: "rgba(255,255,255,.7)",
                    textTransform: "uppercase",
                  }}>Liga INATEL</span>
                </div>
              )}
              {/* Stripe de destaque no primeiro artigo */}
              {i === 0 && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "#F97316", zIndex: 1 }} />
              )}
            </div>

            <div style={{ padding: "18px 20px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
              {/* Data */}
              <p
                style={{
                  fontFamily: "var(--font-ibm-mono, monospace)",
                  fontSize: "10px",
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#8C837A",
                  margin: "0 0 8px",
                }}
              >
                Liga INATEL · {fmtDate(n.published_at ?? n.created_at)}
              </p>

              {/* Título */}
              <h2
                style={{
                  fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                  fontWeight: 800,
                  fontSize: "18px",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  color: "#1A1612",
                  lineHeight: 1.15,
                  margin: "0 0 10px",
                }}
              >
                {n.title}
              </h2>

              {/* Entrada / lide */}
              <p
                style={{
                  fontFamily: "var(--font-barlow, sans-serif)",
                  fontSize: "13px",
                  color: "#3D3630",
                  lineHeight: 1.55,
                  margin: "0",
                  flex: 1,
                }}
              >
                {n.excerpt}
              </p>
            </div>

            {/* Link de detalhe */}
            <div
              style={{
                padding: "14px 20px 18px",
                borderTop: "1px solid rgba(26,22,18,.07)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-barlow-condensed, sans-serif)",
                  fontWeight: 700,
                  fontSize: "12px",
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
      )}
    </section>
  );
}
