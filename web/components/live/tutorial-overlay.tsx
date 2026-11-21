"use client";

import { useEffect, useRef, useState } from "react";
import { LIVE_TUTORIAL, TUTORIAL_QUESTION_MAX } from "@/lib/live/tutorial";
import { SANS } from "./tokens";

interface Turn { q: string; a: string }

const QUICK_QUESTIONS = [
  "Como termino o jogo?",
  "Como mudo de período?",
  "Como anulo uma jogada?",
  "Como faço uma substituição?",
];

/**
 * Tutorial do live + caixa de dúvidas (IA). Renderizado DENTRO do contentor do live
 * (sem portal) para também aparecer em ecrã cheio, como o ShotFlow e o histórico.
 */
export function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"tutorial" | "duvida">("tutorial");
  const [open, setOpen] = useState<string | null>(LIVE_TUTORIAL[0]?.id ?? null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, loading, tab]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/live/tutorial-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: turns.slice(-3) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.answer !== "string") {
        setError(json.error || "Não foi possível responder agora. Tenta de novo.");
        return;
      }
      setTurns((prev) => [...prev, { q, a: json.answer }]);
      setQuestion("");
    } catch {
      setError("Sem ligação. Verifica a internet e tenta de novo.");
    } finally {
      setLoading(false);
    }
  }

  const tabBtn = (id: "tutorial" | "duvida"): React.CSSProperties => ({
    height: 48, padding: "0 18px", borderRadius: 10, cursor: "pointer", fontFamily: SANS,
    fontSize: 14, fontWeight: 800, border: "1px solid var(--line)",
    background: tab === id ? "var(--accent)" : "var(--panel)",
    color: tab === id ? "var(--accentInk)" : "var(--text)",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial do live"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: SANS,
      }}
    >
      <div style={{
        width: "100%", maxWidth: 760, maxHeight: "100%", display: "flex", flexDirection: "column",
        background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 16,
        overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800, flex: 1, minWidth: 140 }}>❓ Tutorial do live</span>
          <button type="button" onClick={() => setTab("tutorial")} style={tabBtn("tutorial")}>Como funciona</button>
          <button type="button" onClick={() => setTab("duvida")} style={tabBtn("duvida")}>Tenho uma dúvida</button>
          <button type="button" onClick={onClose} aria-label="Fechar tutorial"
            style={{ width: 48, height: 48, borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel)", color: "var(--text)", fontSize: 20, fontWeight: 800, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {tab === "tutorial" && LIVE_TUTORIAL.map((s) => {
            const isOpen = open === s.id;
            return (
              <div key={s.id} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)", overflow: "hidden" }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}
                  style={{ width: "100%", minHeight: 52, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", border: "none", background: "transparent", color: "var(--text)", fontFamily: SANS, fontSize: 15, fontWeight: 800 }}>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <span aria-hidden style={{ color: "var(--muted)" }}>{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 14px 14px", fontSize: 14, lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 8 }}>
                    {s.intro?.map((t, i) => <p key={`i${i}`} style={{ margin: 0 }}>{t}</p>)}
                    {s.steps && (
                      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.steps.map((t, i) => <li key={i}>{t}</li>)}
                      </ol>
                    )}
                    {s.tips?.map((t, i) => (
                      <p key={`t${i}`} style={{ margin: 0, padding: "8px 10px", borderRadius: 8, background: "var(--accentSoft)", color: "var(--text)", fontSize: 13 }}>
                        💡 {t}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {tab === "duvida" && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                Escreve a tua dúvida sobre o live. A resposta é gerada por IA com base neste tutorial e pode não estar completa.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {QUICK_QUESTIONS.map((q) => (
                  <button key={q} type="button" disabled={loading} onClick={() => void ask(q)}
                    style={{ minHeight: 44, padding: "0 12px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--chip)", color: "var(--text)", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {q}
                  </button>
                ))}
              </div>
              {turns.map((t, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ alignSelf: "flex-end", maxWidth: "90%", padding: "8px 12px", borderRadius: 12, background: "var(--accent)", color: "var(--accentInk)", fontSize: 14, whiteSpace: "pre-wrap" }}>{t.q}</div>
                  <div style={{ alignSelf: "flex-start", maxWidth: "95%", padding: "8px 12px", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--line)", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{t.a}</div>
                </div>
              ))}
              {loading && <div style={{ fontSize: 13, color: "var(--muted)" }}>A pensar…</div>}
              {error && <div role="alert" style={{ fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>{error}</div>}
              <div ref={endRef} />
            </>
          )}
        </div>

        {tab === "duvida" && (
          <form
            onSubmit={(e) => { e.preventDefault(); void ask(question); }}
            style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--line)", background: "var(--panel)" }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={TUTORIAL_QUESTION_MAX}
              placeholder="Ex.: como registo uma assistência?"
              aria-label="A tua dúvida"
              style={{ flex: 1, minWidth: 0, height: 48, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", fontFamily: SANS, fontSize: 15 }}
            />
            <button type="submit" disabled={loading || !question.trim()}
              style={{ height: 48, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "var(--accentInk)", fontFamily: SANS, fontSize: 14, fontWeight: 800, cursor: loading || !question.trim() ? "not-allowed" : "pointer", opacity: loading || !question.trim() ? 0.6 : 1 }}>
              Perguntar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
