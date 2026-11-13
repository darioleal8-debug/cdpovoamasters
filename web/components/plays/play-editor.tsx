"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayViewer } from "@/components/plays/play-viewer";
import { PLAY_CATEGORIES } from "@/types/plays";
import type { PlayDraft } from "@/lib/plays/normalize";

interface Props {
  playId?: string;
  initialPlay?: PlayDraft | null;
  initialStatus?: "draft" | "published";
  initialPrompt?: string | null;
  initialHistory?: unknown[];
}

const field: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--card)", fontFamily: "'Barlow', sans-serif", fontSize: 14,
};
const label: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12,
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: 4, display: "block",
};
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "10px 18px", borderRadius: 8, border: primary ? "none" : "1px solid var(--border)",
  background: primary ? "var(--action, #F97316)" : "var(--card)", color: primary ? "#fff" : "inherit",
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, textTransform: "uppercase",
  letterSpacing: "0.08em", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
});

const EXAMPLE =
  "Ataque posicional 5 abertos. O 1 passa ao 3 na ala direita e corta para o cesto. O 5 sobe e faz bloqueio ao 2 no lado esquerdo; o 2 usa o bloqueio e recebe no topo da zona. Se o 2 não tiver lançamento, passa ao 4 no canto.";

export function PlayEditor({ playId, initialPlay = null, initialStatus = "draft", initialPrompt = "", initialHistory = [] }: Props) {
  const router = useRouter();
  const [play, setPlay] = useState<PlayDraft | null>(initialPlay);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [history, setHistory] = useState<unknown[]>(initialHistory);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [version, setVersion] = useState(0);

  async function generate() {
    setBusy("gen"); setError(null); setWarnings([]);
    try {
      const res = await fetch("/api/plays/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, current: play }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Erro ao gerar a jogada"); return; }
      setPlay(j.play as PlayDraft);
      setWarnings(j.warnings ?? []);
      setHistory((h) => [...h, { at: new Date().toISOString(), prompt }]);
      setVersion((v) => v + 1);
    } catch {
      setError("Sem ligação ao servidor.");
    } finally {
      setBusy(null);
    }
  }

  async function save(status: "draft" | "published") {
    if (!play) return;
    setBusy("save"); setError(null);
    try {
      const res = await fetch(playId ? `/api/plays/${playId}` : "/api/plays", {
        method: playId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ play, status, ai_prompt: prompt, ai_history: history }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Erro ao guardar"); return; }
      router.push(`/laboratorio/${j.id ?? playId}`);
      router.refresh();
    } catch {
      setError("Sem ligação ao servidor.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!playId || !window.confirm("Apagar esta jogada? Não pode ser desfeito.")) return;
    setBusy("save");
    const res = await fetch(`/api/plays/${playId}`, { method: "DELETE" });
    if (!res.ok) { setBusy(null); setError("Erro ao apagar"); return; }
    router.push("/laboratorio");
    router.refresh();
  }

  const set = <K extends keyof PlayDraft>(k: K, v: PlayDraft[K]) => setPlay((p) => (p ? { ...p, [k]: v } : p));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={label} htmlFor="play-prompt">
          {play ? "Pedir uma alteração à jogada" : "Descreve a jogada"}
        </label>
        <textarea
          id="play-prompt" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder={EXAMPLE} maxLength={3000} style={{ ...field, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={btn(true, busy !== null || prompt.trim().length < 10)} disabled={busy !== null || prompt.trim().length < 10} onClick={generate}>
            {busy === "gen" ? "A gerar…" : play ? "Aplicar alteração" : "Gerar animação"}
          </button>
          {!play && <button type="button" style={btn()} onClick={() => setPrompt(EXAMPLE)}>Usar exemplo</button>}
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Indica posições (ala, canto, topo da zona), quem passa, corta ou bloqueia, e as variantes.
          </span>
        </div>
        {error && <p role="alert" style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>}
        {warnings.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted-foreground)" }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>

      {play && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div><label style={label}>Nome</label><input style={field} value={play.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></div>
            <div>
              <label style={label}>Categoria</label>
              <select style={field} value={play.category} onChange={(e) => set("category", e.target.value)}>
                {PLAY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={label}>Subtítulo</label><input style={field} value={play.eyebrow ?? ""} maxLength={120} onChange={(e) => set("eyebrow", e.target.value || null)} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={label}>Nota do treinador</label><textarea style={{ ...field, resize: "vertical" }} rows={2} value={play.note ?? ""} maxLength={400} onChange={(e) => set("note", e.target.value || null)} /></div>
          </div>

          <PlayViewer key={version} name={play.name} eyebrow={play.eyebrow} note={play.note} init={play.init} steps={play.steps} options={play.options} />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn(false, busy !== null)} disabled={busy !== null} onClick={() => save("draft")}>Guardar rascunho</button>
            <button type="button" style={btn(true, busy !== null)} disabled={busy !== null} onClick={() => save("published")}>
              {initialStatus === "published" ? "Guardar e manter publicada" : "Publicar"}
            </button>
            {playId && <button type="button" style={{ ...btn(false, busy !== null), marginLeft: "auto", color: "#dc2626" }} disabled={busy !== null} onClick={remove}>Apagar</button>}
          </div>
        </>
      )}
    </div>
  );
}
