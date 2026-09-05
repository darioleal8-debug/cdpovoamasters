"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, CheckCircle2, AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Phase =
  | "idle"
  | "requesting"   // a pedir permissão à câmara
  | "preview"      // stream em direto
  | "captured"     // foto tirada, a aguardar confirmação
  | "submitting"   // a enviar para API
  | "success"
  | "error";

interface Props {
  trainingId: string;
  currentStatus: string | null;
  onSuccess?: () => void;
}

export function AutoAttendanceButton({ trainingId, currentStatus, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>(() => {
    if (currentStatus === "present" || currentStatus === "auto_present") return "success";
    return "idle";
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  async function openCamera() {
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("preview");
      // Assign stream after state update so the video element is in the DOM
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => null);
        }
      });
    } catch (err) {
      const msg = String(err).toLowerCase();
      setErrorMsg(
        msg.includes("denied") || msg.includes("permission") || msg.includes("notallowed")
          ? "Permissão de câmara negada. Clica no 🔒 da barra de endereço → Câmara → Permitir → recarrega."
          : "Não foi possível aceder à câmara. Verifica se está disponível e tenta de novo."
      );
      setPhase("error");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    stopStream();
    setPhotoDataUrl(dataUrl);
    setPhase("captured");
  }

  function retake() {
    setPhotoDataUrl(null);
    openCamera();
  }

  function cancel() {
    stopStream();
    setPhotoDataUrl(null);
    setPhase("idle");
  }

  async function submit() {
    if (!photoDataUrl) return;
    setPhase("submitting");
    try {
      const res = await fetch(`/api/trainings/${trainingId}/attendance/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photoDataUrl }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error ?? "Erro ao registar presença.");
        setPhase("error");
        return;
      }
      setPhase("success");
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro inesperado.");
      setPhase("error");
    }
  }

  // ── Estados de resultado ──────────────────────────────────────

  if (phase === "success") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Presença registada com fotografia</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Boa sessão!</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{errorMsg}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setPhase("idle"); setErrorMsg(null); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  // ── Botão inicial ─────────────────────────────────────────────

  if (phase === "idle" || phase === "requesting") {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={openCamera}
        disabled={phase === "requesting"}
        className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-950/30"
      >
        {phase === "requesting" ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A abrir câmara…</>
        ) : (
          <><Camera className="h-4 w-4 mr-2" />Auto-Presença (Fotografia)</>
        )}
      </Button>
    );
  }

  // ── Preview da câmara ─────────────────────────────────────────

  if (phase === "preview") {
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-lg border bg-black" style={{ aspectRatio: "4/3", maxHeight: "200px" }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover scale-x-[-1]"
            playsInline
            muted
          />
          <button
            type="button"
            onClick={cancel}
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            aria-label="Fechar câmara"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex gap-2">
          <Button size="sm" onClick={capturePhoto} className="flex-1">
            <Camera className="h-4 w-4 mr-2" />
            Tirar Foto
          </Button>
          <Button size="sm" variant="outline" onClick={cancel}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  // ── Pré-visualização da foto capturada ────────────────────────

  if (phase === "captured" || phase === "submitting") {
    return (
      <div className="space-y-2">
        {photoDataUrl && (
          <div className="overflow-hidden rounded-lg border" style={{ aspectRatio: "4/3", maxHeight: "200px" }}>
            <img src={photoDataUrl} alt="Foto capturada" className="w-full h-full object-cover scale-x-[-1]" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={phase === "submitting"} className="flex-1">
            {phase === "submitting" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A enviar…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar Presença</>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={retake} disabled={phase === "submitting"}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Repetir
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
