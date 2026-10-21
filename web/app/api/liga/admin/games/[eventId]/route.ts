import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH /api/liga/admin/games/[eventId]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const body = (await req.json()) as {
    event_date?: string;
    event_time?: string | null;
    location?: string | null;
    jornada?: number | null;
    volta?: number | null;
    home_team?: string;
    away_team?: string;
  };

  const adminClient = await createAdminClient();

  const { data: current, error: fetchErr } = await adminClient
    .from("events")
    .select("id, event_date, event_time, location, description, deleted_at, original_scheduled_at, opponent")
    .eq("id", eventId)
    .single();

  if (!current || fetchErr) {
    return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  }

  if (current.deleted_at) {
    return NextResponse.json({ error: "Não é possível editar um jogo eliminado" }, { status: 409 });
  }

  const { data: existingResult } = await adminClient
    .from("league_game_results")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  let meta: Record<string, unknown> = {};
  try {
    meta = current.description ? JSON.parse(current.description as string) : {};
  } catch { /* ignore */ }

  const updates: Record<string, unknown> = {};

  if (body.event_date !== undefined && body.event_date !== current.event_date) {
    if (!current.original_scheduled_at) {
      const origTime = (current.event_time as string | null) ?? "12:00:00";
      updates.original_scheduled_at = new Date(`${current.event_date}T${origTime}`).toISOString();
    }
    updates.event_date = body.event_date;
  }

  if (body.event_time !== undefined) updates.event_time = body.event_time;
  if (body.location !== undefined) updates.location = body.location;

  const metaUpdated = { ...meta };
  let metaChanged = false;

  if (body.jornada !== undefined) { metaUpdated.jornada = body.jornada; metaChanged = true; }
  if (body.volta !== undefined) { metaUpdated.volta = body.volta; metaChanged = true; }

  if (!existingResult) {
    if (body.home_team !== undefined) { metaUpdated.home_team = body.home_team; metaChanged = true; }
    if (body.away_team !== undefined) {
      metaUpdated.away_team = body.away_team;
      updates.opponent = body.away_team;
      metaChanged = true;
    }
  }

  if (metaChanged) {
    updates.description = JSON.stringify(metaUpdated);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhuma alteração fornecida" }, { status: 400 });
  }

  const { error: updateErr } = await adminClient
    .from("events")
    .update(updates)
    .eq("id", eventId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await adminClient.from("game_audit_log").insert({
    event_id: eventId,
    action: "update",
    altered_by: auth.user.id,
    before_data: {
      event_date: current.event_date,
      event_time: current.event_time,
      location: current.location,
      description: current.description,
    },
    after_data: updates,
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/liga/admin/games/[eventId]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;

  const adminClient = await createAdminClient();

  const { data: current, error: fetchErr } = await adminClient
    .from("events")
    .select("id, event_date, event_time, location, description, deleted_at")
    .eq("id", eventId)
    .single();

  if (!current || fetchErr) {
    return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  }

  if (current.deleted_at) {
    return NextResponse.json({ error: "Jogo já eliminado" }, { status: 409 });
  }

  const { error: deleteErr } = await adminClient
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", eventId);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // Remove result so standings recalculate automatically
  await adminClient.from("league_game_results").delete().eq("event_id", eventId);
  // Remove pending submissions (approved ones are historical, keep them via ON DELETE CASCADE)
  await adminClient.from("result_submissions").delete().eq("event_id", eventId).eq("status", "pending");

  await adminClient.from("game_audit_log").insert({
    event_id: eventId,
    action: "delete",
    altered_by: auth.user.id,
    before_data: {
      event_date: current.event_date,
      event_time: current.event_time,
      location: current.location,
    },
  });

  return NextResponse.json({ ok: true });
}
