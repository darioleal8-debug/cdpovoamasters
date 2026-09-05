"use client";

import { useState, useCallback } from "react";
import { getUserLocation, type GeoLocation } from "@/lib/geolocation";

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; location: GeoLocation }
  | { status: "error"; message: string; geoCode?: number };

/**
 * Hook React para obter a localização atual via Geolocation API nativa.
 * Não usa nenhum serviço externo.
 *
 * @example
 * const { state, capture, reset } = useGeolocation();
 * // state.status: "idle" | "loading" | "ok" | "error"
 * // state.location (quando ok): { lat, lng, accuracy }
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });

  const capture = useCallback(async (): Promise<GeoLocation | null> => {
    setState({ status: "loading" });
    try {
      const location = await getUserLocation();
      setState({ status: "ok", location });
      return location;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const geoCode = (err as Error & { geoCode?: number }).geoCode;
      setState({ status: "error", message, geoCode });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, capture, reset };
}
