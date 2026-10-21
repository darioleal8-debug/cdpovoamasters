"use client";

import { useState } from "react";
import { MapPin, CheckCircle2, AlertCircle, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type GpsErrorCode = "permission_denied" | "timeout" | "unavailable" | "unsupported" | "skipped";
type Phase = "idle" | "locating" | "submitting" | "success" | "error" | "no_gps_confirm";

interface CheckinResult {
  status: string;
  method: string;
  gps_status: string | null;
  gps_validated: boolean | null;
  gps_distance_m: number | null;
}

interface Props {
  trainingId: string;
  onSuccess?: () => void;
}

const GPS_ERROR_MSGS: Record<GpsErrorCode, string> = {
  permission_denied: "Permissão de localização negada. Ativa nas definições do browser.",
  timeout:           "Tempo limite excedido (GPS sem sinal — normal dentro de pavilhões).",
  unavailable:       "Não foi possível obter localização. Verifica se o GPS está ativo.",
  unsupported:       "Este dispositivo não suporta GPS.",
  skipped:           "GPS não utilizado.",
};

export function GpsCheckinButton({ trainingId, onSuccess }: Props) {
  const [phase,   setPhase]   = useState<Phase>("idle");
  const [errMsg,  setErrMsg]  = useState<string | null>(null);
  const [result,  setResult]  = useState<CheckinResult | null>(null);
  const [gpsErr,  setGpsErr]  = useState<GpsErrorCode | null>(null);

  async function submitCheckin(
    lat:      number | null,
    lng:      number | null,
    accuracy: number | null,
    gpsError: GpsErrorCode | null = null,
  ) {
    setPhase("submitting");
    try {
      const supabase = createClient();
      const args: Record<string, unknown> = { p_training_id: trainingId };
      if (lat !== null && lng !== null) {
        args.p_lat      = lat;
        args.p_lng      = lng;
        args.p_accuracy = accuracy;
      }
      if (gpsError) args.p_gps_error = gpsError;

      const { data, error } = await supabase.rpc("self_checkin", args);
      if (error) {
        setErrMsg(error.message);
        setPhase("error");
        return;
      }
      setResult(data as CheckinResult);
      setPhase("success");
      onSuccess?.();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Erro de rede.");
      setPhase("error");
    }
  }

  function tryGps(highAccuracy: boolean) {
    if (!("geolocation" in navigator)) {
      setGpsErr("unsupported");
      setPhase("no_gps_confirm");
      return;
    }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        submitCheckin(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        // Timeout com alta precisão → tentar uma vez com baixa precisão
        if (err.code === 3 && highAccuracy) {
          tryGps(false);
          return;
        }
        const code: GpsErrorCode =
          err.code === 1 ? "permission_denied" :
          err.code === 3 ? "timeout" : "unavailable";
        setGpsErr(code);
        setPhase("no_gps_confirm");
      },
      { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 15000 : 10000, maximumAge: 120000 },
    );
  }

  function reset() {
    setPhase("idle");
    setErrMsg(null);
    setResult(null);
    setGpsErr(null);
  }

  // ── Sucesso ───────────────────────────────────────────────
  if (phase === "success" && result) {
    const { gps_status, gps_validated, gps_distance_m, method } = result;

    if (method === "already_validated") {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            A tua presença já foi confirmada pelo treinador.
          </p>
        </div>
      );
    }

    if (gps_validated && gps_distance_m !== null) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Presença registada com GPS
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" />{gps_distance_m} m do pavilhão
            </p>
          </div>
        </div>
      );
    }

    if (gps_status === "out_of_range" && gps_distance_m !== null) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Presença registada</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Fora do raio do pavilhão ({gps_distance_m} m). O treinador irá confirmar.
            </p>
          </div>
        </div>
      );
    }

    if (gps_status === "no_venue_coords") {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Presença registada com GPS
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Pavilhão sem localização configurada — não foi possível validar a distância.
            </p>
          </div>
        </div>
      );
    }

    // manual_no_gps
    const errLabel = gps_status ? (GPS_ERROR_MSGS[gps_status as GpsErrorCode] ?? gps_status) : null;
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Presença registada sem GPS
          </p>
          {errLabel && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 flex items-center gap-1">
              <WifiOff className="h-3 w-3" />{errLabel}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Erro de API ───────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{errMsg}</p>
        </div>
        <Button size="sm" variant="outline" onClick={reset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  // ── GPS falhou — opções sem GPS ───────────────────────────
  if (phase === "no_gps_confirm") {
    const errLabel = gpsErr ? GPS_ERROR_MSGS[gpsErr] : null;
    return (
      <div className="space-y-2">
        {errLabel && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-300">{errLabel}</p>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar com GPS
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white border-0"
            onClick={() => submitCheckin(null, null, null, gpsErr ?? "skipped")}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Marcar sem GPS
          </Button>
        </div>
      </div>
    );
  }

  // ── Estado normal ─────────────────────────────────────────
  const isLoading = phase === "locating" || phase === "submitting";
  return (
    <Button
      size="sm"
      onClick={() => tryGps(true)}
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
