"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { GameSession, PlayByPlay } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";
import type { DerivedPlayerStats } from "@/lib/live/derive-stats";
import { ShareCard } from "./share-card";
import { SANS } from "./tokens";

interface ShareOverlayProps {
  session: GameSession;
  roster: PlayerWithUser[];
  plays: PlayByPlay[];
  playerMap: Map<string, DerivedPlayerStats>;
  clockSecs: number;
  onClose: () => void;
}

type ExportState = "generating" | "ready" | "error";

const PREVIEW_W = 270;
const PREVIEW_H = 338;

export function ShareOverlay({
  session, roster, plays, playerMap, clockSecs, onClose,
}: ShareOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>("generating");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [pdfBlocked, setPdfBlocked] = useState(false);

  // ── Generate image on mount ───────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      if (!cardRef.current) return;
      setExportState("generating");
      try {
        await document.fonts.ready;
        // Small settle delay for layout
        await new Promise(r => setTimeout(r, 120));
        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(cardRef.current, {
          scale: 1,
          useCORS: true,
          logging: false,
          backgroundColor: "#0d1825",
          width: 1080,
          height: 1350,
        });
        setPreviewUrl(canvas.toDataURL("image/jpeg", 0.92));
        setExportState("ready");
      } catch (e) {
        console.error("[share-overlay] html2canvas error:", e);
        setErrorMsg(e instanceof Error ? e.message : "Erro desconhecido");
        setExportState("error");
      }
    };
    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Download JPG ──────────────────────────────────────────────────────────
  const handleJpg = useCallback(() => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    const opp = (session.opponent_name ?? "resultado")
      .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
    const d = new Date(session.started_at ?? Date.now()).toISOString().split("T")[0];
    a.download = `resultado-cdpovoa-${opp}-${d}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [previewUrl, session]);

  // ── Print PDF ─────────────────────────────────────────────────────────────
  const handlePdf = useCallback(() => {
    if (!previewUrl) return;
    setPdfBlocked(false);
    try {
      const win = window.open("", "_blank", "width=1080,height=1350");
      if (!win) { setPdfBlocked(true); return; }
      win.document.write(
        `<!DOCTYPE html><html><head><style>` +
        `@page{size:1080px 1350px;margin:0}` +
        `*{margin:0;padding:0;box-sizing:border-box}` +
        `body{width:1080px;height:1350px;overflow:hidden}` +
        `img{width:1080px;height:1350px;display:block}` +
        `</style></head><body>` +
        `<img src="${previewUrl}"/>` +
        `<script>window.onload=function(){setTimeout(function(){window.print();window.close()},400)};</script>` +
        `</body></html>`
      );
      win.document.close();
    } catch {
      setPdfBlocked(true);
    }
  }, [previewUrl]);

  // ── Esc to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); e.stopPropagation(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const btnBase: React.CSSProperties = {
    width: "100%", height: 48, borderRadius: 12, border: "none",
    fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: "pointer",
    transition: "opacity 0.15s",
  };

  return (
    <>
      {/* Off-screen card — html2canvas target */}
      <div style={{ position: "fixed", left: -1200, top: 0, pointerEvents: "none", zIndex: -1 }}>
        <ShareCard
          ref={cardRef}
          session={session}
          roster={roster}
          plays={plays}
          playerMap={playerMap}
          clockSecs={clockSecs}
        />
      </div>

      {/* Overlay */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, fontFamily: SANS,
        }}
      >
        <div style={{
          background: "#1a2535",
          borderRadius: 20, overflow: "hidden",
          display: "flex", flexDirection: "row",
          maxWidth: 660, width: "100%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}>
          {/* Left — preview */}
          <div style={{
            width: PREVIEW_W + 32, flexShrink: 0,
            background: "#0d1825",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}>
            {exportState === "generating" && (
              <div style={{
                width: PREVIEW_W, height: PREVIEW_H,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 12, color: "#7898b8",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: "3px solid #263a52",
                  borderTopColor: "#1a7c43",
                  animation: "spin 0.8s linear infinite",
                }} />
                <span style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  A gerar…
                </span>
              </div>
            )}
            {exportState === "error" && (
              <div style={{
                width: PREVIEW_W, height: PREVIEW_H,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 12, padding: 16, textAlign: "center",
              }}>
                <span style={{ fontSize: 28 }}>⚠</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>
                  Erro ao gerar imagem
                </span>
                {errorMsg && (
                  <span style={{ fontSize: 11, color: "#7898b8", wordBreak: "break-all" }}>
                    {errorMsg}
                  </span>
                )}
              </div>
            )}
            {exportState === "ready" && previewUrl && (
              <img
                src={previewUrl}
                alt="Pré-visualização do cartão"
                style={{ width: PREVIEW_W, height: PREVIEW_H, borderRadius: 8, display: "block" }}
              />
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>

          {/* Right — actions */}
          <div style={{
            flex: 1, padding: "28px 28px 24px",
            display: "flex", flexDirection: "column", gap: 0,
          }}>
            {/* Title */}
            <div style={{ marginBottom: 20 }}>
              <p style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.18em",
                color: "#1a7c43", textTransform: "uppercase", margin: "0 0 6px",
              }}>
                EXPORTAR RESULTADO
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#edf4ff", margin: 0 }}>
                {session.home_score} — {session.away_score}
              </p>
              <p style={{ fontSize: 12, color: "#7898b8", margin: "4px 0 0" }}>
                CD Póvoa vs {session.opponent_name ?? "Adversário"} · cartão 1080×1350
              </p>
            </div>

            {/* Status */}
            {exportState === "generating" && (
              <p style={{ fontSize: 12, color: "#7898b8", margin: "0 0 16px" }}>
                A preparar o cartão de partilha…
              </p>
            )}
            {exportState === "error" && (
              <p style={{ fontSize: 12, color: "#f87171", margin: "0 0 16px" }}>
                Não foi possível gerar a imagem. Tenta reabrir o painel.
              </p>
            )}
            {exportState === "ready" && (
              <p style={{ fontSize: 12, color: "#4ade80", margin: "0 0 16px" }}>
                ✓ Imagem pronta · pronto para exportar
              </p>
            )}

            {/* PDF blocked warning */}
            {pdfBlocked && (
              <p style={{ fontSize: 12, color: "#fbbf24", margin: "-8px 0 12px", lineHeight: 1.5 }}>
                ⚠ Popup bloqueado pelo browser. Permite popups para hoophub.pt e tenta de novo.
              </p>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={handleJpg}
                disabled={exportState !== "ready"}
                style={{
                  ...btnBase,
                  background: exportState === "ready" ? "#1a7c43" : "#162233",
                  color: exportState === "ready" ? "#edf4ff" : "#4a5568",
                  cursor: exportState === "ready" ? "pointer" : "not-allowed",
                }}
              >
                ⤓ Guardar JPG
              </button>
              <button
                onClick={handlePdf}
                disabled={exportState !== "ready"}
                style={{
                  ...btnBase,
                  background: "transparent",
                  border: `1px solid ${exportState === "ready" ? "#263a52" : "#1e2d42"}`,
                  color: exportState === "ready" ? "#edf4ff" : "#4a5568",
                  cursor: exportState === "ready" ? "pointer" : "not-allowed",
                }}
              >
                ⎙ PDF
              </button>
              <button
                onClick={onClose}
                style={{
                  ...btnBase,
                  background: "transparent",
                  border: "none",
                  color: "#7898b8",
                  marginTop: 4,
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
