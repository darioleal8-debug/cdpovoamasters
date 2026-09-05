import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/geocode?q=<location name>
// Usa Google Maps Geocoding se GOOGLE_MAPS_API_KEY estiver definida,
// caso contrário faz fallback para Nominatim (OpenStreetMap).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Parâmetro 'q' obrigatório." }, { status: 400 });

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;

  // ── Google Maps Geocoding API ─────────────────────────────
  if (googleKey) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json` +
        `?address=${encodeURIComponent(q)}` +
        `&key=${googleKey}` +
        `&region=pt` +
        `&language=pt`;

      const res = await fetch(url, { next: { revalidate: 3600 } });
      const data = await res.json() as {
        status: string;
        results: Array<{
          formatted_address: string;
          geometry: { location: { lat: number; lng: number } };
        }>;
      };

      if (data.status === "OK" && data.results.length > 0) {
        const { lat, lng } = data.results[0].geometry.location;
        return NextResponse.json({
          lat,
          lng,
          display_name: data.results[0].formatted_address,
          source: "google",
        });
      }

      if (data.status === "ZERO_RESULTS") {
        return NextResponse.json({ error: "Localização não encontrada. Tenta um nome mais específico." }, { status: 404 });
      }

      console.error("[geocode] Google Maps erro:", data.status);
      // cai para Nominatim
    } catch (err) {
      console.error("[geocode] Google Maps falhou:", err);
      // cai para Nominatim
    }
  }

  // ── Nominatim / OpenStreetMap (fallback) ─────────────────
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}` +
      `&format=json&limit=1&countrycodes=pt`;

    const res = await fetch(url, {
      headers: { "User-Agent": "HoopHub/1.0 (hoophub.pt)" },
      next: { revalidate: 3600 },
    });
    const data = await res.json() as Array<{
      lat: string; lon: string; display_name: string;
    }>;

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Localização não encontrada. Tenta um nome mais específico." }, { status: 404 });
    }

    return NextResponse.json({
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      display_name: data[0].display_name,
      source: "nominatim",
    });
  } catch (err) {
    console.error("[geocode] Nominatim falhou:", err);
    return NextResponse.json({ error: "Erro ao contactar serviço de geocodificação." }, { status: 500 });
  }
}
