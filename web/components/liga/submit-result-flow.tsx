"use client";

import { useState, useRef } from "react";
import type { PublicGame } from "@/types/competitions";

interface Props {
  games: PublicGame[];
  teamName: string;
}

type Step = "select" | "photo" | "game_photos" | "confirm" | "done";
type UploadedPhoto = { id: string; public_url: string; caption: string };
type StagedPhoto   = { file: File; preview: string; caption: string };

function fmt(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "2-digit", month: "short",
  });
}

const s = {
  btn: (primary?: boolean, disabled?: boolean): React.CSSProperties => ({
    padding: "10px 18px", fontSize: "13px", fontWeight: 700, borderRadius: "8px",
    border: primary ? "none" : "1.5px solid var(--border,#E8E0D4)",
    background: disabled ? "#E8E0D4" : primary ? "#F97316" : "var(--bg,#F6F2EC)",
    color: disabled ? "#8C837A" : primary ? "#fff" : "var(--fg,#15110E)",
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  label: { fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--muted,#6F675F)", display: "block", marginBottom: "6px" },
  numInput: { width: "100%", padding: "12px", fontSize: "28px", fontWeight: 800, textAlign: "center" as const, borderRadius: "10px", border: "1.5px solid var(--border,#E8E0D4)", background: "var(--card,#fff)", fontFamily: "var(--font-ibm-mono,monospace)", boxSizing: "border-box" as const },
};

// Comprime fotos de jogo: lado maior ≤ 1920 px, JPEG 0.8, remove EXIF via canvas
async function compressGamePhoto(file: File): Promise<File> {
  const MAX_PX = 1920;
  return new Promise<File>((resolve, reject) => {
    createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
      let { width, height } = bitmap;
      const scale = Math.min(1, MAX_PX / Math.max(width, height));
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.8);
    }).catch(reject);
  });
}

/**
 * Normaliza SEMPRE a imagem: corrige orientação EXIF, redimensiona lado maior a 2000px,
 * exporta como JPEG qualidade 0.9. Melhora a precisão do OCR e o tamanho do upload.
 */
async function normalizeImage(file: File): Promise<File> {
  const MAX_PX = 2000;

  return new Promise<File>((resolve, reject) => {
    createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
      let { width, height } = bitmap;
      const scale = Math.min(1, MAX_PX / Math.max(width, height));
      width  = Math.round(width  * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", 0.9);
    }).catch(reject);
  });
}

// Converter HEIC para JPEG no browser
async function heicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(result) ? result[0] : result;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

const HEIC_TYPES = ["image/heic", "image/heif"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", ...HEIC_TYPES];
const PDF_TYPE = "application/pdf";

interface ScanResult {
  photo_path?: string;
  equipa_casa?: string | null;
  equipa_fora?: string | null;
  pontos_casa?: number | null;
  pontos_fora?: number | null;
  parciais?: { periodo: number; casa: number; fora: number }[];
  confianca?: number;
  avisos?: string[];
  fallback_manual?: boolean;
  /** Razão legível para o delegado quando o OCR falha */
  reason?: string;
}

export function SubmitResultFlow({ games, teamName }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [selectedGame, setSelectedGame] = useState<PublicGame | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fotos de jogo (passo game_photos)
  const [stagedPhoto, setStagedPhoto] = useState<StagedPhoto | null>(null);
  const [gamePhotos, setGamePhotos]   = useState<UploadedPhoto[]>([]);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const gamePhotoInputRef = useRef<HTMLInputElement>(null);

  const eligibleGames = games.filter(
    (g) =>
      !g.result &&
      g.result_status !== "pending" &&
      new Date(g.event_date) < new Date()
  );

  async function cleanupPhotos() {
    if (gamePhotos.length === 0) return;
    await Promise.allSettled(
      gamePhotos.map((p) => fetch(`/api/liga/equipa/game-photos/${p.id}`, { method: "DELETE" }))
    );
    setGamePhotos([]);
  }

  function reset() {
    setStep("select"); setSelectedGame(null); setScanResult(null);
    setPhotoPreview(null); setHomeScore(""); setAwayScore(""); setNotes(""); setError(null);
    setStagedPhoto(null); setGamePhotos([]); setPhotoConsent(false);
  }

  function close() {
    void cleanupPhotos();
    setOpen(false);
    reset();
  }

  function selectGame(g: PublicGame) {
    if (gamePhotos.length > 0) void cleanupPhotos();
    setSelectedGame(g); setStep("photo"); setError(null);
  }

  async function processFile(raw: File) {
    setProcessing(true); setError(null);

    let file = raw;

    try {
      if (HEIC_TYPES.includes(raw.type) || raw.name.toLowerCase().endsWith(".heic") || raw.name.toLowerCase().endsWith(".heif")) {
        file = await heicToJpeg(raw);
      }

      if (IMAGE_TYPES.includes(file.type)) {
        // Normaliza sempre: corrige orientação EXIF + redimensiona + JPEG 0.9
        file = await normalizeImage(file);
        setPhotoPreview(URL.createObjectURL(file));
      } else if (file.type === PDF_TYPE || raw.type === PDF_TYPE) {
        file = raw;
      }

      const fd = new FormData();
      fd.append("photo", file);
      if (selectedGame) fd.append("game_id", selectedGame.id);

      const res = await fetch("/api/liga/equipa/game-sheet/scan", { method: "POST", body: fd });
      const json: ScanResult & { error?: string } = await res.json();

      if (json.fallback_manual || !res.ok) {
        const reason = json.reason ? ` (${json.reason})` : "";
        setError((json.error ?? "Não foi possível ler automaticamente — preenche manualmente.") + reason);
        setScanResult({ photo_path: json.photo_path });
        setStep("game_photos");
        return;
      }

      setScanResult(json);
      if (json.pontos_casa != null) setHomeScore(String(json.pontos_casa));
      if (json.pontos_fora != null) setAwayScore(String(json.pontos_fora));
      setStep("game_photos");
    } catch (e) {
      setError(`Erro ao processar ficheiro: ${String(e)}`);
      setStep("game_photos");
    } finally {
      setProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  }

  async function handleGamePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    if (gamePhotoInputRef.current) gamePhotoInputRef.current.value = "";
    let file = raw;
    try {
      if (HEIC_TYPES.includes(raw.type) || raw.name.toLowerCase().endsWith(".heic") || raw.name.toLowerCase().endsWith(".heif")) {
        file = await heicToJpeg(raw);
      }
      if (IMAGE_TYPES.includes(file.type)) {
        file = await compressGamePhoto(file);
      }
      const preview = URL.createObjectURL(file);
      setStagedPhoto({ file, preview, caption: "" });
    } catch (e) {
      setError(`Erro ao processar foto: ${String(e)}`);
    }
  }

  async function confirmStagedPhoto() {
    if (!stagedPhoto || !selectedGame) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", stagedPhoto.file);
      fd.append("game_id", selectedGame.id);
      fd.append("team_name", teamName);
      if (stagedPhoto.caption) fd.append("caption", stagedPhoto.caption);
      const res = await fetch("/api/liga/equipa/game-photos", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao carregar foto."); return; }
      setGamePhotos((prev) => [...prev, { id: json.id, public_url: json.public_url, caption: stagedPhoto.caption }]);
      setStagedPhoto(null);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removeGamePhoto(id: string) {
    await fetch(`/api/liga/equipa/game-photos/${id}`, { method: "DELETE" });
    setGamePhotos((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSubmit() {
    if (!selectedGame) return;
    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) { setError("Pontuações inválidas."); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/liga/equipa/game-sheet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedGame.id,
          home_team_name: selectedGame.home_team,
          away_team_name: selectedGame.away_team,
          home_score: hs,
          away_score: as_,
          photo_path: scanResult?.photo_path ?? null,
          notes: notes || undefined,
          extraction_raw: scanResult?.pontos_casa != null ? scanResult : undefined,
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
      <div style={{ borderRadius: "12px", border: "1.5px solid var(--border,#E8E0D4)", padding: "20px 16px" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg,#15110E)", margin: "0 0 4px" }}>
          Submissão de resultados via foto
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: "0 0 12px" }}>
          {eligibleGames.length === 0
            ? "Não há jogos com resultado por registar."
            : `${eligibleGames.length} jogo${eligibleGames.length > 1 ? "s" : ""} por registar · Fotografia, PDF ou HEIC (iPhone)`}
        </p>
        {eligibleGames.length > 0 && (
          <button onClick={() => setOpen(true)} style={s.btn(true)}>Submeter resultado</button>
        )}
      </div>
    );
  }

  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51,
        background: "var(--bg,#F6F2EC)", borderRadius: "16px 16px 0 0",
        padding: "20px 20px 40px", maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#D1C9C0", margin: "0 auto 18px" }} />

        {/* ── STEP: SELECCIONAR JOGO ── */}
        {step === "select" && (
          <>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 16px", color: "var(--fg,#15110E)" }}>
              Qual jogo?
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {eligibleGames.map((g) => {
                const isHome = g.home_team === teamName;
                const opponent = isHome ? g.away_team : g.home_team;
                return (
                  <button key={g.id} onClick={() => selectGame(g)} style={{
                    textAlign: "left", padding: "14px 16px", borderRadius: "10px",
                    border: "1.5px solid var(--border,#E8E0D4)", background: "var(--card,#fff)", cursor: "pointer",
                  }}>
                    <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 2px", color: "var(--fg,#15110E)" }}>
                      {opponent}{g.is_test && <span style={{ marginLeft: 8, fontSize: "10px", color: "#F97316", fontWeight: 700 }}>[TESTE]</span>}
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: 0 }}>
                      {fmt(g.event_date)} · J{g.jornada ?? "?"} {isHome ? "(Casa)" : "(Fora)"}
                    </p>
                  </button>
                );
              })}
            </div>
            <button onClick={close} style={{ ...s.btn(), marginTop: 16, width: "100%" }}>Cancelar</button>
          </>
        )}

        {/* ── STEP: CARREGAR FICHEIRO ── */}
        {step === "photo" && selectedGame && (
          <>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px", color: "var(--fg,#15110E)" }}>
              Folha de jogo
            </h2>
            <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: "0 0 16px" }}>
              {selectedGame.home_team} vs {selectedGame.away_team} · {fmt(selectedGame.event_date)}
            </p>

            {error && <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 12px", background: "#FEF2F2", padding: "10px 12px", borderRadius: "8px" }}>{error}</p>}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
              <button
                onClick={() => { fileInputRef.current?.setAttribute("capture", "environment"); fileInputRef.current?.click(); }}
                disabled={processing}
                style={{ ...s.btn(true, processing), width: "100%", padding: "14px", fontSize: "15px" }}
              >
                {processing ? "A processar…" : "📷 Câmara"}
              </button>
              <button
                onClick={() => { fileInputRef.current?.removeAttribute("capture"); fileInputRef.current?.click(); }}
                disabled={processing}
                style={{ ...s.btn(false, processing), width: "100%", padding: "14px" }}
              >
                {processing ? "A processar…" : "🗂 Ficheiro (imagem ou PDF)"}
              </button>
            </div>

            {/* Dicas para uma boa fotografia */}
            <div style={{ margin: "14px 0 0", padding: "10px 12px", background: "var(--card,#fff)", borderRadius: "8px", border: "1px solid var(--border,#E8E0D4)" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted,#6F675F)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dicas para melhor leitura</p>
              <ul style={{ margin: 0, padding: "0 0 0 14px", listStyle: "disc" }}>
                {["Folha inteira no enquadramento", "Sem sombras, boa iluminação", "De frente, sem inclinação", "Câmara paralela à folha"].map((tip) => (
                  <li key={tip} style={{ fontSize: "11px", color: "var(--muted,#6F675F)", marginBottom: "2px" }}>{tip}</li>
                ))}
              </ul>
              <p style={{ fontSize: "10px", color: "var(--muted,#6F675F)", margin: "6px 0 0" }}>JPEG · PNG · WebP · HEIC (iPhone) · PDF até 15 MB</p>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
              <button onClick={() => { setStep("select"); setError(null); }} style={s.btn()}>← Voltar</button>
              <button onClick={() => { setStep("game_photos"); setError(null); }} style={s.btn()}>Preencher manualmente</button>
            </div>
          </>
        )}

        {/* ── STEP: FOTOS DE JOGO (opcional) ── */}
        {step === "game_photos" && selectedGame && (
          <>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px", color: "var(--fg,#15110E)" }}>
              Fotos do jogo <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--muted,#6F675F)" }}>(opcional)</span>
            </h2>
            <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: "0 0 14px" }}>
              Adiciona até 3 fotos. As fotos podem aparecer na notícia automática.
            </p>

            {error && <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 10px", background: "#FEF2F2", padding: "10px 12px", borderRadius: "8px" }}>{error}</p>}

            {/* Fotos já carregadas */}
            {gamePhotos.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                {gamePhotos.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px", background: "var(--card,#fff)", borderRadius: "8px", border: "1px solid var(--border,#E8E0D4)" }}>
                    <img src={p.public_url} alt={`Foto ${i + 1}`} style={{ width: "60px", height: "45px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: "0 0 2px" }}>
                        {p.caption || <em>Sem legenda</em>}
                      </p>
                    </div>
                    <button onClick={() => removeGamePhoto(p.id)} style={{ ...s.btn(), padding: "4px 8px", fontSize: "11px", flexShrink: 0 }}>Remover</button>
                  </div>
                ))}
              </div>
            )}

            {/* Foto em staging (aguarda legenda + confirmação) */}
            {stagedPhoto && (
              <div style={{ padding: "12px", background: "var(--card,#fff)", borderRadius: "8px", border: "1.5px solid #F97316", marginBottom: "10px" }}>
                <img src={stagedPhoto.preview} alt="Pré-visualização" style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "6px", marginBottom: "8px" }} />
                <input
                  type="text"
                  placeholder="Legenda opcional (máx. 120 caracteres)"
                  maxLength={120}
                  value={stagedPhoto.caption}
                  onChange={(e) => setStagedPhoto((p) => p ? { ...p, caption: e.target.value } : null)}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px", borderRadius: "8px", border: "1.5px solid var(--border,#E8E0D4)", background: "var(--bg,#F6F2EC)", boxSizing: "border-box" as const, marginBottom: "8px" }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => setStagedPhoto(null)} style={s.btn()}>Cancelar</button>
                  <button onClick={confirmStagedPhoto} disabled={uploadingPhoto} style={{ ...s.btn(true, uploadingPhoto), flex: 1 }}>
                    {uploadingPhoto ? "A carregar…" : "Adicionar foto"}
                  </button>
                </div>
              </div>
            )}

            {/* Botão adicionar (só se < 3 fotos e nenhuma em staging) */}
            {!stagedPhoto && gamePhotos.length < 3 && (
              <>
                <input
                  ref={gamePhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  style={{ display: "none" }}
                  onChange={handleGamePhotoSelect}
                />
                <button
                  onClick={() => { gamePhotoInputRef.current?.setAttribute("capture", "environment"); gamePhotoInputRef.current?.click(); }}
                  style={{ ...s.btn(), width: "100%", padding: "12px", marginBottom: "6px" }}
                >
                  📷 Câmara — {gamePhotos.length}/3 fotos
                </button>
                <button
                  onClick={() => { gamePhotoInputRef.current?.removeAttribute("capture"); gamePhotoInputRef.current?.click(); }}
                  style={{ ...s.btn(), width: "100%", padding: "12px", marginBottom: "12px" }}
                >
                  🗂 Galeria ou ficheiro — {gamePhotos.length}/3 fotos
                </button>
              </>
            )}

            {gamePhotos.length >= 3 && (
              <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: "0 0 12px", textAlign: "center" }}>
                Limite de 3 fotos atingido.
              </p>
            )}

            {/* Consentimento (obrigatório se há fotos) */}
            {gamePhotos.length > 0 && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "14px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={photoConsent}
                  onChange={(e) => setPhotoConsent(e.target.checked)}
                  style={{ marginTop: "2px", flexShrink: 0 }}
                />
                <span style={{ fontSize: "12px", color: "var(--fg,#15110E)", lineHeight: 1.5 }}>
                  Confirmo que tenho autorização para publicar estas fotos e que os jogadores fotografados concordaram.
                </span>
              </label>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setStep("photo"); setError(null); setStagedPhoto(null); }} style={s.btn()}>← Voltar</button>
              <button
                onClick={() => { setStep("confirm"); setError(null); }}
                disabled={gamePhotos.length > 0 && !photoConsent}
                style={{ ...s.btn(true, gamePhotos.length > 0 && !photoConsent), flex: 1 }}
              >
                Continuar
              </button>
            </div>
          </>
        )}

        {/* ── STEP: CONFIRMAR RESULTADO ── */}
        {step === "confirm" && selectedGame && (
          <>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px", color: "var(--fg,#15110E)" }}>
              Confirmar resultado
            </h2>
            <p style={{ fontSize: "12px", color: "var(--muted,#6F675F)", margin: "0 0 14px" }}>
              {selectedGame.home_team} vs {selectedGame.away_team}
            </p>

            {photoPreview && (
              <img src={photoPreview} alt="Folha" style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "8px", marginBottom: "14px" }} />
            )}

            {/* Indicador de confiança */}
            {scanResult?.confianca != null && scanResult.confianca > 0 && (() => {
              const c = scanResult.confianca;
              const low = c < 0.7;
              const bg  = c >= 0.8 ? "#F0FDF4" : c >= 0.5 ? "#FFFBEB" : "#FEF2F2";
              const bc  = c >= 0.8 ? "#BBF7D0" : c >= 0.5 ? "#FDE68A" : "#FECACA";
              return (
                <div style={{ marginBottom: "12px", padding: "8px 12px", borderRadius: "8px", background: bg, border: `1px solid ${bc}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px" }}>{c >= 0.8 ? "✓" : c >= 0.5 ? "⚠" : "!"}</span>
                    <span style={{ fontSize: "12px", color: "var(--fg,#15110E)", fontWeight: low ? 700 : 400 }}>
                      Confiança: {Math.round(c * 100)}%{low ? " — VERIFICA OS VALORES COM ATENÇÃO" : " — revê os valores antes de submeter"}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Aviso: equipas lidas na folha não correspondem ao jogo selecionado */}
            {scanResult?.equipa_casa != null && selectedGame && (() => {
              const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
              const casaOk = normalize(selectedGame.home_team).includes(normalize(scanResult.equipa_casa!)) ||
                             normalize(scanResult.equipa_casa!).includes(normalize(selectedGame.home_team));
              const foraOk = normalize(selectedGame.away_team).includes(normalize(scanResult.equipa_fora ?? "")) ||
                             normalize(scanResult.equipa_fora ?? "").includes(normalize(selectedGame.away_team));
              if (casaOk && foraOk) return null;
              return (
                <div style={{ marginBottom: "12px", padding: "8px 12px", background: "#FEF3C7", borderRadius: "8px", border: "1px solid #FCD34D" }}>
                  <p style={{ fontSize: "12px", color: "#92400E", margin: 0, fontWeight: 600 }}>
                    ⚠ Equipas da folha não coincidem com o jogo selecionado
                  </p>
                  <p style={{ fontSize: "11px", color: "#92400E", margin: "4px 0 0" }}>
                    Folha: {scanResult.equipa_casa} vs {scanResult.equipa_fora ?? "?"} · Jogo: {selectedGame.home_team} vs {selectedGame.away_team}
                  </p>
                  <p style={{ fontSize: "11px", color: "#92400E", margin: "2px 0 0" }}>
                    Confirma que carregaste a folha correcta antes de submeter.
                  </p>
                </div>
              );
            })()}

            {/* Avisos do OCR */}
            {scanResult?.avisos && scanResult.avisos.length > 0 && (
              <div style={{ marginBottom: "12px", padding: "8px 12px", background: "#FFFBEB", borderRadius: "8px", border: "1px solid #FDE68A" }}>
                {scanResult.avisos.map((a, i) => <p key={i} style={{ fontSize: "12px", color: "#92400E", margin: 0 }}>⚠ {a}</p>)}
              </div>
            )}

            {error && (
              <p style={{ fontSize: "13px", color: "#DC2626", margin: "0 0 12px", background: "#FEF2F2", padding: "10px 12px", borderRadius: "8px" }}>{error}</p>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div>
                <label style={s.label}>{selectedGame.home_team}</label>
                <input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} placeholder="—" style={s.numInput} />
              </div>
              <div>
                <label style={s.label}>{selectedGame.away_team}</label>
                <input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} placeholder="—" style={s.numInput} />
              </div>
            </div>

            {/* Parciais (se disponíveis) */}
            {(scanResult?.parciais ?? []).length > 0 && (
              <div style={{ marginBottom: "12px" }}>
                <p style={{ ...s.label, marginBottom: "6px" }}>Parciais por período</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                  {scanResult!.parciais!.map((p) => (
                    <div key={p.periodo} style={{ textAlign: "center", padding: "6px 8px", background: "var(--card,#fff)", borderRadius: "6px", border: "1px solid var(--border,#E8E0D4)" }}>
                      <p style={{ fontSize: "10px", color: "var(--muted,#6F675F)", margin: "0 0 2px" }}>P{p.periodo}</p>
                      <p style={{ fontSize: "13px", fontWeight: 700, margin: 0, fontVariantNumeric: "tabular-nums" }}>{p.casa}–{p.fora}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <textarea
              placeholder="Notas opcionais (W/O, adiado, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ width: "100%", padding: "10px 12px", fontSize: "13px", borderRadius: "8px", border: "1.5px solid var(--border,#E8E0D4)", background: "var(--card,#fff)", resize: "vertical", marginBottom: "14px", boxSizing: "border-box" as const }}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setStep("game_photos"); setError(null); }} style={s.btn()}>
                ← Voltar
              </button>
              <button onClick={handleSubmit} disabled={submitting || homeScore === "" || awayScore === ""}
                style={{ ...s.btn(true, submitting || homeScore === "" || awayScore === ""), flex: 1 }}>
                {submitting ? "A submeter…" : "Submeter resultado"}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: CONCLUÍDO ── */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>✓</div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px", color: "var(--fg,#15110E)" }}>
              Resultado submetido!
            </h2>
            <p style={{ fontSize: "13px", color: "var(--muted,#6F675F)", margin: "0 0 24px" }}>
              O resultado ficará pendente até ser aprovado pelo administrador da liga.
            </p>
            <button onClick={close} style={{ ...s.btn(true), width: "100%" }}>Fechar</button>
          </div>
        )}
      </div>
    </>
  );
}
