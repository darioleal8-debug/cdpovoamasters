"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Candidate = {
  key: string;
  kind: "import" | "submission";
  id: string;
  import_id: string | null;
  origin: "delegado" | "admin";
  label: string;
  created_at: string;
  status: string;
  image_url: string | null;
  is_pdf: boolean;
  quality: { score: number; errors: number; warnings: number; summary: string[] } | null;
  analysis_count: number;
  error: string | null;
  is_best: boolean;
};

type Overview = { finished: boolean; candidates: Candidate[]; best_key: string | null; max_analyses: number };

const STATUS: Record<string, string> = {
  por_analisar: "Por analisar",
  nao_suportado: "PDF — sem análise automática",
  processing: "A analisar…",
  needs_review: "Analisada · precisa de revisão",
  ready_to_confirm: "Analisada · consistente",
  confirmed: "Confirmada",
  published: "Aplicada ao jogo",
  failed: "Leitura falhou",
};

const small = { fontSize: "11px", color: "#6B7280", margin: 0 } as const;
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "6px 10px", fontSize: "11px", fontWeight: 700, borderRadius: "6px", cursor: disabled ? "not-allowed" : "pointer",
  border: primary ? "none" : "1px solid #E8E0D6", background: disabled ? "#E8E0D6" : primary ? "#F97316" : "#fff",
  color: disabled ? "#8C837A" : primary ? "#fff" : "#1A1612",
});

function scoreColor(score: number) {
  return score >= 75 ? "#065F46" : score >= 50 ? "#92400E" : "#DC2626";
}

/**
 * Folhas de jogo de um jogo (admin da liga): carregar uma folha melhorada, analisar todas
 * com o DeepSeek e ver qual tem a melhor leitura, para rever e aplicar ao jogo.
 */
export function AdminGameSheets({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/liga/admin/games/${eventId}/sheets`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar folhas");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  async function analyzeOne(c: Candidate, force = false): Promise<string | null> {
    const res = await fetch(`/api/liga/admin/games/${eventId}/sheets/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: c.kind, id: c.id, force }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return json.error ?? "Erro na análise";
    return json.analysis_error ?? null;
  }

  async function analyzeAll() {
    if (!data) return;
    const todo = data.candidates.filter((c) => c.status === "por_analisar" || (c.status === "failed" && c.analysis_count < data.max_analyses));
    if (todo.length === 0) { setProgress("Todas as folhas já estão analisadas."); return; }
    setBusy("all"); setError(null);
    const errors: string[] = [];
    for (let i = 0; i < todo.length; i++) {
      setProgress(`A analisar folha ${i + 1} de ${todo.length}… (até 1 min cada)`);
      const err = await analyzeOne(todo[i]);
      if (err) errors.push(`${todo[i].label}: ${err}`);
    }
    setProgress(errors.length ? null : `${todo.length} folha(s) analisada(s).`);
    if (errors.length) setError(errors.join(" · "));
    setBusy(null);
    await load();
  }

  async function analyzeSingle(c: Candidate, force: boolean) {
    if (force && !window.confirm("Reanalisar substitui a leitura atual desta folha (incluindo correções manuais). Continuar?")) return;
    setBusy(c.key); setError(null); setProgress("A analisar… (até 1 min)");
    const err = await analyzeOne(c, force);
    setProgress(null);
    if (err) setError(err);
    setBusy(null);
    await load();
  }

  async function upload(file: File) {
    setBusy("upload"); setError(null); setProgress("A carregar e analisar a folha… (até 1 min)");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/liga/admin/games/${eventId}/sheets`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro no upload");
      setProgress(json.skipped ? "Esta imagem já tinha sido carregada." : json.analysis_error ? null : "Folha carregada e analisada.");
      if (json.analysis_error) setError(`Leitura automática falhou: ${json.analysis_error}`);
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    }
  }

  if (loading && !data) return <p style={{ fontSize: "12px", color: "#8C837A" }}>A carregar folhas de jogo…</p>;
  if (!data) return error ? <p style={{ fontSize: "12px", color: "#DC2626" }}>{error}</p> : null;

  const pending = data.candidates.filter((c) => c.status === "por_analisar").length;
  const best = data.candidates.find((c) => c.is_best);

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px" }}>
        {data.finished && (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <button style={btn(false, busy !== null)} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              ⬆ Carregar folha melhorada
            </button>
          </>
        )}
        {data.candidates.length > 0 && (
          <button style={btn(true, busy !== null)} disabled={busy !== null} onClick={() => void analyzeAll()}>
            {busy === "all" ? "A analisar…" : `Analisar todas as folhas${pending ? ` (${pending} por analisar)` : ""}`}
          </button>
        )}
      </div>
      {!data.finished && <p style={{ ...small, marginBottom: "8px" }}>O carregamento de folhas melhoradas fica disponível depois do jogo.</p>}
      {progress && <p style={{ fontSize: "11px", color: "#0369A1", margin: "0 0 8px" }}>{progress}</p>}
      {error && <p style={{ fontSize: "11px", color: "#DC2626", margin: "0 0 8px" }}>{error}</p>}

      {data.candidates.length === 0 ? (
        <p style={{ fontSize: "12px", color: "#8C837A" }}>Sem folhas de jogo para este jogo.</p>
      ) : (
        <>
          {best && best.quality && (
            <p style={{ fontSize: "12px", margin: "0 0 8px", color: "#065F46", fontWeight: 600 }}>
              Melhor leitura: {best.label} — {best.quality.score.toFixed(0)}/100.
              {best.import_id && <> <a href={`/liga-inatel/boletim/${best.import_id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#C2530A" }}>Rever e aplicar ao jogo ↗</a></>}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {data.candidates.map((c) => (
              <div key={c.key} style={{
                width: "220px", background: "#F6F2EC", borderRadius: "8px", overflow: "hidden",
                border: c.is_best ? "2px solid #16A34A" : "1px solid #E8E0D6",
              }}>
                {c.image_url && !c.is_pdf ? (
                  <a href={c.image_url} target="_blank" rel="noopener noreferrer" title="Abrir em tamanho real">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_url} alt={c.label} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block", background: "#fff" }} />
                  </a>
                ) : (
                  <a href={c.image_url ?? "#"} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", aspectRatio: "3/4", fontSize: "12px", color: "#6B7280" }}>
                    📄 {c.is_pdf ? "PDF" : "Sem pré-visualização"}
                  </a>
                )}
                <div style={{ padding: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, margin: 0 }}>{c.label}</p>
                    {c.is_best && <span style={{ fontSize: "10px", fontWeight: 800, color: "#fff", background: "#16A34A", borderRadius: "4px", padding: "1px 5px" }}>MELHOR</span>}
                  </div>
                  <p style={small}>{new Date(c.created_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })} · {STATUS[c.status] ?? c.status}</p>
                  {c.quality && (
                    <>
                      <p style={{ fontSize: "16px", fontWeight: 800, margin: "4px 0 2px", color: scoreColor(c.quality.score) }}>
                        {c.quality.score.toFixed(0)}<span style={{ fontSize: "11px", color: "#6B7280", fontWeight: 600 }}>/100</span>
                      </p>
                      <ul style={{ margin: 0, paddingLeft: "14px" }}>
                        {c.quality.summary.slice(0, 5).map((s, i) => <li key={i} style={small}>{s}</li>)}
                      </ul>
                    </>
                  )}
                  {c.error && c.status === "failed" && <p style={{ ...small, color: "#DC2626" }}>{c.error}</p>}
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "6px" }}>
                    {c.status === "por_analisar" && (
                      <button style={btn(false, busy !== null)} disabled={busy !== null} onClick={() => void analyzeSingle(c, false)}>Analisar</button>
                    )}
                    {c.kind === "import" && ["needs_review", "ready_to_confirm", "failed"].includes(c.status) && c.analysis_count < data.max_analyses && (
                      <button style={btn(false, busy !== null)} disabled={busy !== null} onClick={() => void analyzeSingle(c, c.status !== "failed")}>
                        Reanalisar ({c.analysis_count}/{data.max_analyses})
                      </button>
                    )}
                    {c.import_id && (
                      <a href={`/liga-inatel/boletim/${c.import_id}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(c.is_best), textDecoration: "none" }}>
                        Rever ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...small, marginTop: "8px" }}>
            A pontuação combina a legibilidade avaliada pelo DeepSeek com o que o sistema consegue verificar: marcha lida, pontos atribuídos,
            confiança das marcações e consistência com parciais e resultado. Nada é aplicado ao jogo sem revisão.
          </p>
        </>
      )}
    </div>
  );
}
