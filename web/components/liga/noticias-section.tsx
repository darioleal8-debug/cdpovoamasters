import type { NoticiaPublic } from "@/lib/competitions-data";

const PT_MONTHS_LONG = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} de ${PT_MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

export function NoticiasSection({ noticias }: { noticias: NoticiaPublic[] }) {
  if (noticias.length === 0) return null;

  return (
    <section
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "0 20px 60px",
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
      </div>

      {/* Artigos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {noticias.map((n, i) => (
          <article
            key={n.id}
            style={{
              background: "#FFFDFA",
              borderRadius: "8px",
              boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.2)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Stripe de destaque no primeiro artigo */}
            {i === 0 && (
              <div style={{ height: "4px", background: "#F97316" }} />
            )}

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
                Liga INATEL · {fmtDate(n.publicado_em ?? n.created_at)}
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
                {n.titulo}
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
                {n.entrada}
              </p>
            </div>

            {/* Corpo expandido (primeiros 300 chars) */}
            <div
              style={{
                padding: "0 20px 18px",
                borderTop: "1px solid rgba(26,22,18,.07)",
                marginTop: "2px",
                paddingTop: "14px",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-barlow, sans-serif)",
                  fontSize: "12px",
                  color: "#6F675F",
                  lineHeight: 1.6,
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {n.corpo}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
