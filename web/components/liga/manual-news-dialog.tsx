"use client";

import { useEffect, useState } from "react";

const LIMITS = { title: 120, excerpt: 300, body: 20000 };

const label: React.CSSProperties = { fontSize: "12px", fontWeight: 700, display: "block", margin: "12px 0 4px" };
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "14px", lineHeight: 1.5,
  borderRadius: "6px", border: "1px solid #E8E0D6", fontFamily: "inherit", resize: "vertical",
};
const hint: React.CSSProperties = { fontSize: "11px", color: "#8C837A", margin: "3px 0 0", textAlign: "right" };
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "8px 14px", fontSize: "12px", fontWeight: 700, borderRadius: "6px",
  cursor: disabled ? "not-allowed" : "pointer",
  border: primary ? "none" : "1px solid #E8E0D6",
  background: disabled ? "#E8E0D6" : primary ? "#F97316" : "#fff",
  color: disabled ? "#8C837A" : primary ? "#fff" : "#1A1612",
});

type Loaded = {
  news: { id: string; title: string; excerpt: string; body: string; cover_image_url: string | null } | null;
  game: { id: string; home: string | null; away: string | null } | null;
};

/**
 * Admin da liga: escrever e publicar uma notícia à mão, sem DeepSeek.
 * - gameId: notícia do jogo (substitui a existente, se houver).
 * - newsId: editar uma notícia existente.
 * - nenhum: notícia avulsa da Liga INATEL.
 */
export function ManualNewsDialog({
  gameId,
  newsId,
  onClose,
  onDone,
}: {
  gameId?: string | null;
  newsId?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const needsLoad = !!(gameId || newsId);
  const [loaded, setLoaded] = useState<Loaded | null>(needsLoad ? null : { news: null, game: null });
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [genImage, setGenImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!needsLoad) return;
    (async () => {
      try {
        const qs = newsId ? `news_id=${encodeURIComponent(newsId)}` : `game_id=${encodeURIComponent(gameId!)}`;
        const res = await fetch(`/api/liga/admin/news/manual?${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
        setLoaded(json);
        if (json.news) {
          setTitle(json.news.title ?? "");
          setExcerpt(json.news.excerpt ?? "");
          setBody(json.news.body ?? "");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [gameId, newsId, needsLoad]);

  const existing = loaded?.news ?? null;
  const game = loaded?.game ?? null;
  const hasCover = !!existing?.cover_image_url;
  const canSave = !!loaded && !saving && title.trim().length > 0 && body.trim().length > 0;

  async function publish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/liga/admin/news/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          news_id: existing?.id ?? newsId ?? null,
          game_id: gameId ?? null,
          title, excerpt, body,
          generate_image: genImage,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falhou");
      const img = json.has_cover
        ? ""
        : json.image_queued
          ? " A imagem por IA está a ser gerada."
          : " Sem imagem de capa — pode carregar uma no separador Notícias.";
      onDone(`✓ Notícia ${json.created ? "publicada" : "actualizada"} manualmente.${img}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const heading = existing ? "Editar notícia manualmente" : "Escrever notícia manual";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "hsl(var(--card))", borderRadius: "12px", padding: "20px", maxWidth: "760px", width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 4px 24px rgba(0,0,0,.25)" }}>
        <p style={{ fontWeight: 800, fontSize: "15px", margin: "0 0 4px" }}>{heading}</p>
        <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
          O texto é publicado tal como o escrever, sem passar pelo DeepSeek.
          {game?.home && game?.away ? ` Notícia do jogo ${game.home} vs ${game.away}${existing ? " — substitui a notícia actual." : "."}` : ""}
        </p>

        {!loaded && !error && <p style={{ fontSize: "12px", color: "#8C837A", marginTop: "12px" }}>A carregar…</p>}

        {loaded && (
          <>
            <label style={label}>Título *</label>
            <input style={input} value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: CD Póvoa vence com autoridade A Portuguesa de Leça" />
            <p style={hint}>{title.length}/{LIMITS.title}</p>

            <label style={label}>Entrada <span style={{ fontWeight: 400, color: "#8C837A" }}>(opcional — se ficar vazia, usa o início do corpo)</span></label>
            <textarea style={input} rows={2} value={excerpt} maxLength={LIMITS.excerpt} onChange={(e) => setExcerpt(e.target.value)} />
            <p style={hint}>{excerpt.length}/{LIMITS.excerpt}</p>

            <label style={label}>Corpo da notícia *</label>
            <textarea style={input} rows={14} value={body} maxLength={LIMITS.body} onChange={(e) => setBody(e.target.value)}
              placeholder="Separe os parágrafos com uma linha em branco." />
            <p style={hint}>{body.length}/{LIMITS.body}</p>

            {!hasCover && (
              <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "12px", marginTop: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={genImage} onChange={(e) => setGenImage(e.target.checked)} style={{ marginTop: "2px" }} />
                <span>
                  Gerar imagem de capa por IA se o jogo não tiver fotografias
                  <span style={{ display: "block", color: "#8C837A" }}>
                    Se houver fotos do jogo, é usada a primeira. Sem esta opção, pode carregar uma imagem depois no separador Notícias.
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        {error && <p style={{ fontSize: "12px", color: "#DC2626", margin: "10px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px" }}>
          <button style={btn(false, saving)} disabled={saving} onClick={onClose}>Cancelar</button>
          <button style={btn(true, !canSave)} disabled={!canSave} onClick={() => void publish()}>
            {saving ? "A publicar…" : existing ? "Guardar e publicar" : "Publicar notícia"}
          </button>
        </div>
      </div>
    </div>
  );
}
