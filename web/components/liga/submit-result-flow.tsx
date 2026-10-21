"use client";

import { useState, useRef } from "react";
import type { PublicGame } from "@/types/competitions";

interface Props {
  games: PublicGame[];
  teamName: string;
}

type Step = "select" | "photo" | "confirm" | "done";

function fmt(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "2-digit", month: "short",
  });
}

const btn = (primary?: boolean, disabled?: boolean): React.CSSProperties => ({
  padding: "9px 18px",
  fontSize: "13px",
  fontWeight: 700,
  borderRadius: "8px",
  border: primary ? "none" : "1.5px solid var(--border, #E8E0D4)",
  background: disabled ? "#E8E0D4" : primary ? "#F97316" : "var(--bg, #F6F2EC)",
  color: disabled ? "#8C837A" : primary ? "#fff" : "var(--fg, #15110E)",
  cursor: disabled ? "not-allowed" : "pointer",
});

export function SubmitResultFlow({ games, teamName }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [selectedGame, setSelectedGame] = useState<PublicGame | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState<string>("");
  const [awayScore, setAwayScore] = useState<string>("");
  const [homeTeamName, setHomeTeamName] = useState<string>("");
  const [awayTeamName, setAwayTeamName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const eligibleGames = games.filter(
    (g) => !g.result && new Date(g.event_date) < new Date()
  );

  function reset() {
    setStep("select");
    setSelectedGame(null);
    setPhotoPath(null);
    setPhotoPreview(null);
    setHomeScore("");
    setAwayScore("");
    setHomeTeamName("");
    setAwayTeamName("");
    setNotes("");
    setError(null);
  }

  function close() { setOpen(false); reset(); }

  function selectGame(g: PublicGame) {
    setSelectedGame(g);
    setHomeTeamName(g.home_team);
    setAwayTeamName(g.away_team);
    setStep("photo");
    setError(null);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoPreview(URL.createObjectURL(file));
    setUploading(true);
    setScanning(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/liga/equipa/game-sheet/scan", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok) { setError(json.error ?? "Erro ao processar imagem."); return; }

      setPhotoPath(json.photo_path ?? null);
      if (json.home_score != null) setHomeScore(String(json.home_score));
      if (json.away_score != null) setAwayScore(String(json.away_score));
      if (json.home_team) setHomeTeamName(json.home_team);
      if (json.away_team) setAwayTeamName(json.away_team);
      setStep("confirm");
    } finally {
      setUploading(false);
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit() {
    if (!selectedGame) return;
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) {
      setError("Pontuações inválidas.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/liga/equipa/game-sheet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedGame.id,
          home_team_name: homeTeamName || selectedGame.home_team,
          away_team_name: awayTeamName || selectedGame.away_team,
          home_score: hs,
          away_score: as_,
          photo_path: photoPath,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao submeter."); return; }
      setStep("done");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div style={{ borderRadius: "12px", border: "1.5px solid #E8E0D4", padding: "20px 16px" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg, #15110E)", margin: "0 0 4px" }}>
          Submissão de resultados via foto
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted, #6F675F)", margin: "0 0 12px" }}>
          Fotografa a folha de jogo e submete o resultado.{" "}
          {eligibleGames.length === 0
            ? "Não há jogos com resultado por registar."
            : `${eligibleGames.length} jogo${eligibleGames.length > 1 ? "s" : ""} por registar.`}
        </p>
        {eligibleGames.length > 0 && (
          <button onClick={() => setOpen(true)} style={btn(true)}>
            Submeter resultado
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
      />
      {/* Modal bottom sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51,
        background: "var(--bg, #F6F2EC)", borderRadius: "16px 16px 0 0",
        padding: "24px 20px 40px", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#D1C9C0", margin: "0 auto 20px" }} />

        {step === "select" && (
          <>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 16px", color: "var(--fg, #15110E)" }}>
              Qual jogo?
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {eligibleGames.map((g) => {
                const isHome = g.home_team === teamName;
                const opponent = isHome ? g.away_team : g.home_team;
                return (
                  <button
                    key={g.id}
                    onClick={() => selectGame(g)}
                    style={{
                      textAlign: "left", padding: "14px 16px", borderRadius: "10px",
                      border: "1.5px solid var(--border, #E8E0D4)",
                      background: "var(--card, #fff)", cursor: "pointer",
                    }}
                  >
                    <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px", color: "var(--fg, #15110E)" }}>
                      {opponent}
                      {g.is_test && (
                        <span style={{ marginLeft: 8, fontSize: "10px", color: "#F97316", fontWeight: 700 }}>
                          [TESTE]
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--muted, #6F675F)", margin: 0 }}>
                      {fmt(g.event_date)} · J{g.jornada ?? "?"}
                      {isHome ? " (Casa)" : " (Fora)"}
                    </p>
                  </button>
                );
              })}
            </div>
            <button onClick={close} style={{ ...btn(), marginTop: 16, width: "100%" }}>
              Cancelar
            </button>
          </>
        )}

        {step === "photo" && selectedGame && (
          <>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px", color: "var(--fg, #15110E)" }}>
              Foto da folha de jogo
            </h2>
            <p style={{ fontSize: "12px", color: "var(--muted, #6F675F)", margin: "0 0 16px" }}>
              {selectedGame.home_team} vs {selectedGame.away_team} · {fmt(selectedGame.event_date)}
            </p>

            {error && <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 12px" }}>{error}</p>}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              style={{ display: "none" }}
              onChange={handlePhoto}
            />

            <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
              <button
                onClick={() => { fileInputRef.current?.setAttribute("capture", "environment"); fileInputRef.current?.click(); }}
                disabled={uploading}
                style={{ ...btn(true, uploading), width: "100%", padding: "14px" }}
              >
                {uploading ? "A processar…" : "📷 Tirar foto"}
              </button>
              <button
                onClick={() => { fileInputRef.current?.removeAttribute("capture"); fileInputRef.current?.click(); }}
                disabled={uploading}
                style={{ ...btn(false, uploading), width: "100%", padding: "14px" }}
              >
                {uploading ? "A processar…" : "🗂 Escolher ficheiro"}
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <button onClick={() => { setStep("select"); setError(null); }} style={btn()}>
                ← Voltar
              </button>
              <button
                onClick={() => { setStep("confirm"); setError(null); }}
                style={btn()}
              >
                Introduzir manualmente
              </button>
            </div>
          </>
        )}

        {step === "confirm" && selectedGame && (
          <>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px", color: "var(--fg, #15110E)" }}>
              Confirmar resultado
            </h2>
            <p style={{ fontSize: "12px", color: "var(--muted, #6F675F)", margin: "0 0 16px" }}>
              {selectedGame.home_team} vs {selectedGame.away_team}
            </p>

            {photoPreview && (
              <img
                src={photoPreview}
                alt="Folha de jogo"
                style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "8px", marginBottom: "16px" }}
              />
            )}
            {scanning && (
              <p style={{ fontSize: "12px", color: "#F97316", margin: "0 0 12px" }}>
                A ler folha de jogo…
              </p>
            )}

            {error && <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 12px" }}>{error}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted, #6F675F)", display: "block", marginBottom: "6px" }}>
                  {selectedGame.home_team}
                </label>
                <input
                  type="number"
                  min="0"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  placeholder="0"
                  style={{
                    width: "100%", padding: "12px", fontSize: "24px", fontWeight: 800,
                    textAlign: "center", borderRadius: "10px",
                    border: "1.5px solid var(--border, #E8E0D4)",
                    background: "var(--card, #fff)", fontFamily: "var(--font-ibm-mono, monospace)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted, #6F675F)", display: "block", marginBottom: "6px" }}>
                  {selectedGame.away_team}
                </label>
                <input
                  type="number"
                  min="0"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  placeholder="0"
                  style={{
                    width: "100%", padding: "12px", fontSize: "24px", fontWeight: 800,
                    textAlign: "center", borderRadius: "10px",
                    border: "1.5px solid var(--border, #E8E0D4)",
                    background: "var(--card, #fff)", fontFamily: "var(--font-ibm-mono, monospace)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <textarea
              placeholder="Notas opcionais (ex: W/O, adiado, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{
                width: "100%", padding: "10px 12px", fontSize: "13px", borderRadius: "8px",
                border: "1.5px solid var(--border, #E8E0D4)", background: "var(--card, #fff)",
                resize: "vertical", marginBottom: "16px", boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setStep("photo"); setError(null); }} style={btn()}>
                ← Voltar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || homeScore === "" || awayScore === ""}
                style={{ ...btn(true, submitting || homeScore === "" || awayScore === ""), flex: 1 }}
              >
                {submitting ? "A submeter…" : "Submeter resultado"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p style={{ fontSize: "40px", margin: "0 0 12px" }}>✓</p>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "var(--fg, #15110E)" }}>
              Resultado submetido!
            </h2>
            <p style={{ fontSize: "13px", color: "var(--muted, #6F675F)", margin: "0 0 24px" }}>
              O resultado ficará pendente até ser aprovado pelo administrador da liga.
            </p>
            <button onClick={close} style={{ ...btn(true), width: "100%" }}>
              Fechar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
