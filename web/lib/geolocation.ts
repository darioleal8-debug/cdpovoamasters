// Geolocation utility — usa exclusivamente a API nativa do browser.
// Sem Google Maps API, sem Mapbox, sem serviços externos.

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy: number; // metros
}

/**
 * Obtém a posição atual do utilizador via Geolocation API nativa.
 * Compatível com Chrome, Safari, Firefox e Edge (desktop e mobile).
 *
 * @example
 * const loc = await getUserLocation();
 * console.log(loc.lat, loc.lng, loc.accuracy);
 */
export async function getUserLocation(): Promise<GeoLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return reject(new Error("A Geolocation API não é suportada por este browser."));
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        // Códigos GeolocationPositionError
        const messages: Record<number, string> = {
          1: "Permissão de localização negada pelo browser.",
          2: "Localização indisponível. Verifica se o GPS está ativo ou tenta noutra rede.",
          3: "Tempo limite excedido. Certifica-te de que o GPS está ligado e tenta de novo.",
        };
        const e = new Error(messages[err.code] ?? err.message ?? "Erro desconhecido ao obter localização.");
        (e as Error & { geoCode: number }).geoCode = err.code;
        reject(e);
      },
      {
        enableHighAccuracy: true,
        timeout:            8000,
        maximumAge:         0,
      }
    );
  });
}

// ─── URLs do Google Maps (gratuitas, sem API key) ─────────────

/** Abre o ponto num mapa Google Maps. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** URL de direções do Maps: da posição atual para um destino. */
export function googleMapsDirectionsUrl(
  fromLat: number,
  fromLng: number,
  destLat: number,
  destLng: number
): string {
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${fromLat},${fromLng}` +
    `&destination=${destLat},${destLng}`
  );
}
