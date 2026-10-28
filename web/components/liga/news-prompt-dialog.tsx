"use client";

import { useEffect, useState } from "react";

type Defaults = { system: string; user: string; format: string };

const label: React.CSSProperties = { fontSize: "12px", fontWeight: 700, display: "block", margin: "12px 0 4px" };
const area: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px", fontSize: "12px", lineHeight: 1.45,
  borderRadius: "6px", border: "1px solid #E8E0D6", fontFamily: "var(--font-ibm-mono, monospace)", resize: "vertical",
};
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "8px 14px", fontSize: "12px", fontWeight: 700, borderRadius: "6px",
  cursor: disabled ? "not-allowed" : "pointer",
  border: primary ? "none" : "1px solid #E8E0D6",
  background: disabled ? "#E8E0D6" : primary ? "#F97316" : "#fff",
  color: disabled ? "#8C837A" : primary ? "#fff" : "#1A1612",
});

/**
 * Admin da liga: gerar a notícia de um jogo com o seu próprio prompt, quando não está
 * contente com a interpretação do DeepSeek. Mostra os prompts por defeito (editáveis).
 */
export function NewsPromptDialog({
  gameId,
  onClose,
  onDone,
}: {
  gameId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [system, setSystem] = useState("");
  const [user, setUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/liga/admin/generate-news?game_id=${encodeURIComponent(gameId)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar o prompt");
        setDefaults(json);
        setSystem(json.system);
        setUser(json.user);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [gameId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/liga/admin/generate-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: gameId, system_prompt: system, user_prompt: user }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falhou");
      onDone("✓ Notícia gerada com o prompt personalizado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGenerating(false);
    }
  }

  const changed = defaults ? system !== defaults.system || user !== defaults.user : false;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", padding: "20px", maxWidth: "760px", width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 4px 24px rgba(0,0,0,.25)" }}>
        <p style={{ fontWeight: 800, fontSize: "15px", margin: "0 0 4px" }}>Gerar notícia com prompt personalizado</p>
        <p style={{ fontSize: "12px", color: "#6B7280", margin: 0 }}>
          Edite as instruções e/ou os factos enviados ao DeepSeek. Os dados do jogo já vêm preenchidos; corrija o que estiver errado
          ou acrescente o que sabe (ex.: melhor marcador, momento decisivo). Pontuações que escrever aqui são aceites na notícia.
        </p>

        {loading && <p style={{ fontSize: "12px", color: "#8C837A", marginTop: "12px" }}>A carregar prompt…</p>}

        {defaults && (
          <>
            <label style={label}>1. Instruções editoriais (tom, estrutura, restrições)</label>
            <textarea style={area} rows={9} value={system} maxLength={12000} onChange={(e) => setSystem(e.target.value)} />

            <label style={label}>2. Pedido com os factos do jogo</label>
            <textarea style={area} rows={14} value={user} maxLength={12000} onChange={(e) => setUser(e.target.value)} />

            <details style={{ marginTop: "10px" }}>
              <summary style={{ fontSize: "11px", color: "#6B7280", cursor: "pointer" }}>Formato de resposta (fixo, acrescentado automaticamente)</summary>
              <pre style={{ ...area, whiteSpace: "pre-wrap", background: "#F6F2EC", margin: "6px 0 0" }}>{defaults.format}</pre>
            </details>
          </>
        )}

        {error && <p style={{ fontSize: "12px", color: "#DC2626", margin: "10px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: "8px", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap" }}>
          <button style={btn(false, !changed || generating)} disabled={!changed || generating}
            onClick={() => { if (defaults) { setSystem(defaults.system); setUser(defaults.user); } }}>
            Repor prompt original
          </button>
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={btn(false, generating)} disabled={generating} onClick={onClose}>Cancelar</button>
            <button style={btn(true, !defaults || generating || !system.trim() || !user.trim())}
              disabled={!defaults || generating || !system.trim() || !user.trim()} onClick={() => void generate()}>
              {generating ? "A gerar… (até 1 min)" : "Gerar notícia"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
