"use client";

import { useState } from "react";
import { MapPin, CheckCircle2, AlertCircle, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "locating" | "submitting" | "success" | "error" | "no_gps_confirm";
type GpsStatus = "ok" | "denied" | "unavailable" | "timeout" | "unsupported" | "error";

interface CheckinResult {
  has_gps:       boolean;
  gps_validated: boolean | null;
  distance_m:    number | null;
}

interface Props {
  trainingId: string;
  onSuccess?: () => void;
}

const GPS_ERROR_LABELS: Record<GpsStatus, string> = {
  ok:          "",
  denied:      "Permissão de localização negada. Ativa nas definições do browser.",
  unavailable: "Não foi possível obter localização. Verifica se o GPS está ativo.",
  timeout:     "Tempo limite excedido. Tenta num local com melhor sinal.",
  unsupported: "O teu dispositivo não suporta GPS.",
  error:       "Erro ao obter localização.",
};

async function tryGetLocation(): Promise<{ status: GpsStatus; lat?: number; lng?: number; accuracy?: number }> {
  if (!("geolocation" in navigator)) return { status: "unsupported" };

  return new Promise((resolve) => {
    // Safety timeout: some browsers never call back
    const timer = setTimeout(() => resolve({ status: "timeout" }), 10_000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          status:   "ok",
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        clearTimeout(timer);
        const map: Record<number, GpsStatus> = { 1: "denied", 2: "unavailable", 3: "timeout" };
        resolve({ status: map[err.code] ?? "error" });
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 }
    );
  });
}

export function GpsCheckinButton({ trainingId, onSuccess }: Props) {
  const [phase,     setPhase]     = useState<Phase>("idle");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [result,    setResult]    = useState<CheckinResult | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus | null>(null);

  async function submitCheckin(lat: number | null, lng: number | null, accuracy: number | null) {
    setPhase("submitting");
    try {
      const body: Record<string, unknown> = {};
      if (lat !== null && lng !== null) {
        body.lat      = lat;
        body.lng      = lng;
        body.accuracy = accuracy;
      }
      const res  = await fetch(`/api/trainings/${trainingId}/attendance/checkin`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as CheckinResult & { error?: string };
      if (!res.ok) {
        setErrorMsg(json.error ?? "Erro ao registar presença.");
        setPhase("error");
        return;
      }
      setResult(json);
      setPhase("success");
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro de rede.");
      setPhase("error");
    }
  }

  async function startCheckin() {
    setPhase("locating");
    const loc = await tryGetLocation();
    setGpsStatus(loc.status);

    if (loc.status === "ok" && loc.lat !== undefined && loc.lng !== undefined) {
      await submitCheckin(loc.lat, loc.lng, loc.accuracy ?? null);
    } else {
      // GPS falhou — mostrar opção para continuar sem localização
      setPhase("no_gps_confirm");
    }
  }

  function reset() {
    setPhase("idle");
    setErrorMsg(null);
    setResult(null);
    setGpsStatus(null);
  }

  // ── Sucesso ───────────────────────────────────────────────────────────────────
  if (phase === "success" && result) {
    const { has_gps, gps_validated, distance_m } = result;

    if (!has_gps) {
      const gpsLabel = gpsStatus ? GPS_ERROR_LABELS[gpsStatus] : null;
      return (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">Presença registada ✓</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                <WifiOff className="h-3 w-3 shrink-0" />
                Não foi possível registar a localização.
                {gpsLabel ? ` ${gpsLabel}` : ""}
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (gps_validated === false && distance_m !== null) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Presença registada ✓</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Fora do raio esperado — {distance_m}m do recinto (máx. 500m). O treinador irá confirmar.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Presença registada ✓</p>
          {gps_validated && distance_m !== null && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              GPS validado · {distance_m}m do recinto
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Erro de API ───────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{errorMsg}</p>
        </div>
        <Button size="sm" variant="outline" onClick={reset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  // ── GPS falhou — oferecer marcar sem localização ──────────────────────────────
  if (phase === "no_gps_confirm") {
    const label = gpsStatus ? GPS_ERROR_LABELS[gpsStatus] : "Não foi possível obter localização.";
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-300">{label}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar com GPS
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white border-0"
            onClick={() => submitCheckin(null, null, null)}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Marcar sem GPS
          </Button>
        </div>
      </div>
    );
  }

  // ── Estado normal / a carregar ────────────────────────────────────────────────
  const isLoading = phase === "locating" || phase === "submitting";
  return (
    <Button
      size="sm"
      onClick={startCheckin}
      disabled={isLoading}
      className="bg-blue-600 hover:bg-blue-700 text-white border-0"
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {phase === "locating" ? "A obter localização…" : "A registar…"}
        </>
      ) : (
        <>
          <MapPin className="h-4 w-4 mr-2" />
          Marcar Presença
        </>
      )}
    </Button>
  );
}
