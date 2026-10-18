import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/** Distância Haversine em metros entre dois pontos WGS-84. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GPS_RADIUS_M = 500;

// POST /api/trainings/[id]/attendance/checkin
// Body: { lat?: number, lng?: number, accuracy?: number }
// lat/lng são opcionais — se ausentes, regista presença sem validação GPS.
// Janela: start_time ≤ hora_atual_lisboa ≤ end_time + 30 min
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trainingId } = await params;

  // Sessão + conta ativa
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  let body: { lat?: unknown; lng?: unknown; accuracy?: unknown };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const lat      = typeof body.lat === "number" ? body.lat      : null;
  const lng      = typeof body.lng === "number" ? body.lng      : null;
  const accuracy = typeof body.accuracy === "number" ? body.accuracy : null;
  const hasGps   = lat !== null && lng !== null;

  if (hasGps) {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return fail("Coordenadas GPS fora do intervalo válido");
    }
  }

  const adminClient = await createAdminClient();

  // Buscar treino
  const { data: training } = await adminClient
    .from("trainings")
    .select("id, date, start_time, end_time, season_id, location_lat, location_lng")
    .eq("id", trainingId)
    .maybeSingle();
  if (!training) return fail("Treino não encontrado", 404);

  // Validar janela de check-in usando timestamps absolutos em hora de Lisboa.
  // Parsear a hora de Lisboa como se fosse UTC — o offset cancela-se na comparação
  // porque tanto o "agora" como as horas do treino são expressos em hora local Lisboa.
  const lisbonNowStr = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" });
  const nowMs = new Date(lisbonNowStr.replace(" ", "T")).getTime();

  const trainingDateStr = training.date as string;
  const startHHMM = training.start_time ? (training.start_time as string).slice(0, 5) : null;
  const endHHMM   = training.end_time   ? (training.end_time   as string).slice(0, 5) : null;

  if (!startHHMM) return fail("Treino sem hora de início definida.");

  const openMs  = new Date(`${trainingDateStr}T${startHHMM}:00`).getTime();
  const closeMs = endHHMM
    ? new Date(`${trainingDateStr}T${endHHMM}:00`).getTime() + 120 * 60_000
    : openMs + 240 * 60_000;

  // Hora de fecho em formato HH:MM (no sistema "Lisboa como UTC", .toISOString() dá hora local)
  const closeTimeStr = new Date(closeMs).toISOString().slice(11, 16);

  if (nowMs < openMs) {
    return fail(`O check-in ainda não está aberto. Abre às ${startHHMM}h.`);
  }
  if (nowMs > closeMs) {
    return fail(`O check-in fechou às ${closeTimeStr}h (2 horas após o fim do treino).`);
  }

  // Buscar jogador — season-specific, com fallback
  const db = adminClient;
  let playerId: string | null = null;
  {
    const { data: p1 } = await db
      .from("players").select("id")
      .eq("user_id", user.id).eq("season_id", training.season_id as string)
      .maybeSingle();
    if (p1) {
      playerId = (p1 as { id: string }).id;
    } else {
      const { data: p2 } = await db
        .from("players").select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      playerId = p2 ? (p2 as { id: string }).id : null;
    }
  }
  if (!playerId) return fail("Sem perfil de jogador associado. Contacta o teu treinador.", 403);

  // Verificar se já tem presença confirmada (não sobrescrever presença de staff)
  const { data: existing } = await db
    .from("training_attendance")
    .select("id, status")
    .eq("training_id", trainingId)
    .eq("player_id", playerId)
    .maybeSingle();

  const existingStatus = (existing as { status?: string } | null)?.status;
  if (existingStatus === "present" || existingStatus === "late") {
    return NextResponse.json(
      { error: "A tua presença já está registada neste treino." },
      { status: 409 }
    );
  }

  // Calcular distância ao recinto (se ambas as coords disponíveis)
  const venueLat = training.location_lat as number | null;
  const venueLng = training.location_lng as number | null;

  let gpsDistanceM: number | null = null;
  let gpsValidated: boolean | null = null;

  if (hasGps && venueLat !== null && venueLng !== null) {
    gpsDistanceM = Math.round(haversineMeters(lat!, lng!, venueLat, venueLng));
    gpsValidated = gpsDistanceM <= GPS_RADIUS_M;
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await db
    .from("training_attendance")
    .upsert(
      {
        training_id:    trainingId,
        player_id:      playerId,
        status:         "auto_present",
        method:         hasGps ? "gps_checkin" : "no_gps",
        gps_lat:        lat,
        gps_lng:        lng,
        gps_accuracy_m: accuracy,
        gps_validated:  gpsValidated,
        gps_distance_m: gpsDistanceM,
        auto_timestamp: now,
        updated_at:     now,
        updated_by:     user.id,
      },
      { onConflict: "training_id,player_id" }
    );

  if (upsertErr) {
    console.error("[checkin] upsert error:", upsertErr.message);
    return fail(upsertErr.message, 500);
  }

  console.log(
    `[checkin] player=${playerId} training=${trainingId}`,
    hasGps ? `lat=${lat} lng=${lng} dist=${gpsDistanceM}m validated=${gpsValidated}` : "no_gps"
  );

  return NextResponse.json({
    success:      true,
    has_gps:      hasGps,
    gps_validated: gpsValidated,
    distance_m:   gpsDistanceM,
  });
}
