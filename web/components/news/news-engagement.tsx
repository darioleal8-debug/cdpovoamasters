"use client";

import { useCallback, useEffect, useState } from "react";
import { buildShareLinks, formatViews, type ShareNetworkId } from "@/lib/news/share-links";

// Bloco final de cada notícia: votação (gostei / não gostei), contador de
// visualizações e partilha nas redes sociais mais usadas.
// O visitante é anónimo: id aleatório em localStorage (o mesmo da analítica da Liga).

const VISITOR_KEY = "hh_liga_vid";
const ENDPOINT = "/api/public/news-engagement";

interface Engagement {
  views: number;
  likes: number;
  dislikes: number;
  my_vote: 0 | 1 | -1;
}

interface Props {
  newsId: string;
  url: string;
  title: string;
  /** Cor de destaque (por omissão laranja da Liga) */
  accent?: string;
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

async function post(body: Record<string, unknown>): Promise<Engagement | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? (data as Engagement) : null;
  } catch {
    return null;
  }
}

const ICONS: Record<ShareNetworkId, string> = {
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  instagram: "",
  telegram:
    "M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  email: "",
};

function NetworkIcon({ id }: { id: ShareNetworkId }) {
  if (id === "email") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    );
  }
  if (id === "instagram") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={ICONS[id]} />
    </svg>
  );
}

function Thumb({ down }: { down?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={down ? { transform: "scaleY(-1)" } : undefined}
    >
      <path d="M7 10v11H3V10h4zM7 10l4-8c1.5 0 2.5 1.2 2.2 2.7L12.7 8H19a2 2 0 012 2.3l-1.4 8A2 2 0 0117.6 20H7" />
    </svg>
  );
}

export function NewsEngagement({ newsId, url, title, accent = "#F97316" }: Props) {
  const [data, setData] = useState<Engagement | null>(null);
  const [visitor, setVisitor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [igHint, setIgHint] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // Regista a visualização (1 por visitante/dia, decidido no servidor) e carrega o estado
  useEffect(() => {
    const vid = getVisitorId();
    setVisitor(vid);
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    let alive = true;
    post({ action: "view", news_id: newsId, visitor_id: vid }).then((d) => {
      if (alive && d) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [newsId]);

  const vote = useCallback(
    async (v: 1 | -1) => {
      if (!visitor || busy) return;
      const prev = data;
      const next: 0 | 1 | -1 = data?.my_vote === v ? 0 : v;
      // Atualização imediata; o servidor confirma a seguir
      if (data) {
        const likes = data.likes - (data.my_vote === 1 ? 1 : 0) + (next === 1 ? 1 : 0);
        const dislikes = data.dislikes - (data.my_vote === -1 ? 1 : 0) + (next === -1 ? 1 : 0);
        setData({ ...data, likes, dislikes, my_vote: next });
      }
      setBusy(true);
      const fresh = await post({ action: "vote", news_id: newsId, visitor_id: visitor, vote: next });
      setBusy(false);
      if (fresh) setData(fresh);
      else if (prev) setData(prev);
    },
    [visitor, busy, data, newsId]
  );

  async function copyLink(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      /* sem permissão para a área de transferência */
      return false;
    }
  }

  // O Instagram não tem partilha por link: copia-se o link e abre-se o Instagram para o colar
  async function shareInstagram() {
    const ok = await copyLink();
    setIgHint(ok);
    setTimeout(() => setIgHint(false), 5000);
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      /* o utilizador cancelou */
    }
  }

  const links = buildShareLinks(url, title);
  const voteStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    borderRadius: "999px",
    border: `1px solid ${active ? accent : "rgba(26,22,18,.15)"}`,
    background: active ? accent : "transparent",
    color: active ? "#fff" : "#3D3630",
    fontFamily: "var(--font-barlow, sans-serif)",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
    transition: "background .15s, color .15s, border-color .15s",
  });
  const roundBtn: React.CSSProperties = {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    flexShrink: 0,
  };
  const label: React.CSSProperties = {
    fontFamily: "var(--font-ibm-mono, monospace)",
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#8C837A",
    margin: "0 0 12px",
  };

  return (
    <section
      aria-label="Interação com a notícia"
      style={{ marginTop: "40px", paddingTop: "24px", borderTop: "1px solid rgba(26,22,18,.1)" }}
    >
      {/* Votação + visualizações */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", marginBottom: "28px" }}>
        <div>
          <p style={label}>Gostou desta notícia?</p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={() => vote(1)}
              disabled={!visitor || busy}
              aria-pressed={data?.my_vote === 1}
              aria-label="Gostei desta notícia"
              style={voteStyle(data?.my_vote === 1)}
            >
              <Thumb />
              <span>Gostei</span>
              <span>{data ? data.likes : "–"}</span>
            </button>
            <button
              type="button"
              onClick={() => vote(-1)}
              disabled={!visitor || busy}
              aria-pressed={data?.my_vote === -1}
              aria-label="Não gostei desta notícia"
              style={voteStyle(data?.my_vote === -1)}
            >
              <Thumb down />
              <span>Não gostei</span>
              <span>{data ? data.dislikes : "–"}</span>
            </button>
          </div>
        </div>

        <p
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            margin: 0,
            fontFamily: "var(--font-barlow, sans-serif)",
            fontSize: "13px",
            fontWeight: 600,
            color: "#8C837A",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {data ? formatViews(data.views) : "–"}
        </p>
      </div>

      {/* Partilha */}
      <p style={label}>Partilhar</p>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {links.map((l) =>
          l.id === "instagram" ? (
            <button
              key={l.id}
              type="button"
              onClick={shareInstagram}
              aria-label="Partilhar no Instagram (copia a ligação e abre o Instagram)"
              title="Instagram (copia o link)"
              style={{ ...roundBtn, background: "linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)" }}
            >
              <NetworkIcon id="instagram" />
            </button>
          ) : (
          <a
            key={l.id}
            href={l.href}
            target={l.id === "email" ? undefined : "_blank"}
            rel="noopener noreferrer"
            aria-label={`Partilhar no ${l.label}`}
            title={l.label}
            style={{ ...roundBtn, background: l.color }}
          >
            <NetworkIcon id={l.id} />
          </a>
          )
        )}
        {canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            aria-label="Mais opções de partilha (Instagram, Messenger e outras apps)"
            title="Mais (Instagram, Messenger…)"
            style={{ ...roundBtn, background: "linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={copyLink}
          aria-label="Copiar ligação da notícia"
          title={copied ? "Copiado!" : "Copiar link"}
          style={{ ...roundBtn, background: copied ? "#22C55E" : "#3D3630", transition: "background .2s" }}
        >
          {copied ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5" />
              <path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" />
            </svg>
          )}
        </button>
      </div>
      {igHint && (
        <p role="status" style={{ margin: "12px 0 0", fontFamily: "var(--font-barlow, sans-serif)", fontSize: "13px", color: "#3D3630" }}>
          Link copiado — cola-o numa história, mensagem ou publicação do Instagram.
        </p>
      )}
    </section>
  );
}
