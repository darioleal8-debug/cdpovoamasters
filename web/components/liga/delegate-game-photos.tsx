"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicGame } from "@/types/competitions";
import { prepareGamePhoto } from "@/lib/liga/game-photo-client";

type TeamPhoto = { id: string; public_url: string; caption: string | null; hidden: boolean; can_delete: boolean };

interface Props {
  games: PublicGame[];          // jogos de hoje e passados da equipa (mais recentes primeiro)
  teamName: string;
  preselectedGameId?: string | null;
}

function fmt(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
}

const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "10px 12px",
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: 600,
  border: primary ? "none" : "1.5px solid var(--border,#E8E0D4)",
  background: primary ? (disabled ? "#FDBA74" : "#F97316") : "var(--card,#fff)",
  color: primary ? "#fff" : "var(--fg,#15110E)",
  cursor: disabled ? "not-allowed" : "pointer",
});

function GamePhotosPanel({ game }: { game: PublicGame }) {
  const [photos, setPhotos] = useState<TeamPhoto[] | null>(null);
  const [max, setMax] = useState(10);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/liga/equipa/game-photos?game_id=${game.id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Erro ao carregar fotos."); setPhotos([]); return; }
    setPhotos(json.photos ?? []);
    setMax(json.max ?? 10);
  }, [game.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setError(null);
    const room = Math.max(0, max - (photos?.length ?? 0));
    const batch = files.slice(0, room);
    if (files.length > room) setError(`Só é possível adicionar mais ${room} foto(s).`);

    for (let i = 0; i < batch.length; i++) {
      setBusy(`A carregar ${i + 1}/${batch.length}…`);
      try {
        const file = await prepareGamePhoto(batch[i]);
        const fd = new FormData();
        fd.append("photo", file);
        fd.append("game_id", game.id);
        if (caption.trim()) fd.append("caption", caption.trim());
        const res = await fetch("/api/liga/equipa/game-photos", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setError(json.error ?? "Erro no upload."); break; }
      } catch (err) {
        setError(`Erro ao processar foto: ${String(err)}`);
        break;
      }
    }
    setCaption("");
    setBusy(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remover esta foto?")) return;
    setBusy("A remover…");
    const res = await fetch(`/api/liga/equipa/game-photos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Erro ao remover.");
    }
    setBusy(null);
    await load();
  }

  const count = photos?.length ?? 0;
  const full = count >= max;

  return (
    <div style={{ padding: "12px 14px 14px", borderTop: "1px solid var(--border,#E8E0D4)" }}>
      {error && (
        <p style={{ fontSize: "12px", color: "#DC2626", background: "#FEF2F2", padding: "8px 10px", borderRadius: "8px", margin: "0 0 10px" }}>{error}</p>
      )}

      {photos === null ? (
        <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: 0 }}>A carregar…</p>
      ) : (
        <>
          {photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "8px", marginBottom: "12px" }}>
              {photos.map((p) => (
                <div key={p.id} style={{ position: "relative", borderRadius: "8px", overflow: "hidden", border: p.hidden ? "2px solid #FCA5A5" : "1px solid var(--border,#E8E0D4)", background: "#1A1612" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.public_url} alt={p.caption ?? "Foto do jogo"} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block", opacity: p.hidden ? 0.5 : 1 }} />
                  {p.hidden && (
                    <span style={{ position: "absolute", left: 4, top: 4, fontSize: "9px", fontWeight: 700, background: "#DC2626", color: "#fff", padding: "1px 5px", borderRadius: "4px" }}>OCULTA</span>
                  )}
                  {p.can_delete && (
                    <button
                      onClick={() => remove(p.id)}
                      disabled={!!busy}
                      aria-label="Remover foto"
                      style={{ position: "absolute", right: 4, top: 4, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: "14px", lineHeight: 1 }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!full ? (
            <>
              <input
                type="text"
                placeholder="Legenda opcional (máx. 120 caracteres)"
                maxLength={120}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={!!busy}
                style={{ width: "100%", padding: "8px 10px", fontSize: "13px", borderRadius: "8px", border: "1.5px solid var(--border,#E8E0D4)", background: "var(--bg,#F6F2EC)", boxSizing: "border-box", marginBottom: "8px" }}
              />
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                style={{ display: "none" }}
                onChange={handleFiles}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => { inputRef.current?.setAttribute("capture", "environment"); inputRef.current?.removeAttribute("multiple"); inputRef.current?.click(); }}
                  disabled={!!busy}
                  style={{ ...btn(false, !!busy), flex: 1 }}
                >📷 Câmara</button>
                <button
                  onClick={() => { inputRef.current?.removeAttribute("capture"); inputRef.current?.setAttribute("multiple", ""); inputRef.current?.click(); }}
                  disabled={!!busy}
                  style={{ ...btn(true, !!busy), flex: 1 }}
                >{busy ?? "🖼 Galeria"}</button>
              </div>
            </>
          ) : (
            <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: 0 }}>Limite de {max} fotos atingido. Remove uma para adicionar outra.</p>
          )}
          <p style={{ fontSize: "11px", color: "var(--muted,#6F675F)", margin: "8px 0 0" }}>
            {count}/{max} fotos da tua equipa. {game.result ? "As fotos aparecem na página do jogo e na notícia." : "As fotos podem aparecer na notícia automática."}
          </p>
        </>
      )}
    </div>
  );
}

export function DelegateGamePhotos({ games, teamName, preselectedGameId }: Props) {
  const [openId, setOpenId] = useState<string | null>(
    preselectedGameId && games.some((g) => g.id === preselectedGameId) ? preselectedGameId : null,
  );

  if (games.length === 0) {
    return <p style={{ fontSize: "14px", color: "var(--muted,#6F675F)", padding: "12px 0" }}>Ainda não há jogos realizados.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {games.map((g) => {
        const isHome = g.home_team === teamName;
        const opponent = isHome ? g.away_team : g.home_team;
        const open = openId === g.id;
        const score = g.result
          ? (isHome ? `${g.result.home_score}–${g.result.away_score}` : `${g.result.away_score}–${g.result.home_score}`)
          : null;
        return (
          <div key={g.id} style={{ borderRadius: "10px", border: open ? "1.5px solid #F97316" : "1px solid var(--border,#E8E0D4)", background: "var(--card,#fff)", overflow: "hidden" }}>
            <button
              onClick={() => setOpenId(open ? null : g.id)}
              style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", cursor: "pointer" }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: "14px", color: "var(--fg,#15110E)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {isHome ? "vs" : "@"} {opponent}
                </span>
                <span style={{ display: "block", fontSize: "12px", color: "var(--muted,#6F675F)" }}>
                  {fmt(g.event_date)}{score ? ` · ${score}` : ""}
                </span>
              </span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#F97316", whiteSpace: "nowrap" }}>
                {open ? "Fechar" : "📷 Fotos"}
              </span>
            </button>
            {open && <GamePhotosPanel game={g} />}
          </div>
        );
      })}
    </div>
  );
}
