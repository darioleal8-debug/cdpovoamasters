import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { hasAnyRole, MANAGERS } from "@/lib/auth/roles";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get("seasonId");
  if (!seasonId) return fail("seasonId é obrigatório");

  // Sessão + conta ativa; o papel vem de authorize() (papel ativo)
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const db = adminDb();

  const isPrivileged = hasAnyRole(auth.profile, MANAGERS);
  if (!isPrivileged) return fail("Sem permissão", 403);

  const today = new Date().toISOString().slice(0, 10);

  const [trainingsRes, squadRes] = await Promise.all([
    db.from("trainings")
      .select("id, date, type")
      .eq("season_id", seasonId)
      .order("date", { ascending: true }),
    db.from("players")
      .select("id", { count: "exact", head: true })
      .eq("season_id", seasonId),
  ]);

  const allTrainings = trainingsRes.data ?? [];
  const squadSize    = squadRes.count ?? 0;
  const pastIds      = allTrainings.filter((t) => t.date < today).map((t) => t.id);

  // Fetch attendance + rsvps only for past trainings
  const [attRes, rsvpRes] = pastIds.length
    ? await Promise.all([
        db.from("training_attendance")
          .select("training_id, status")
          .in("training_id", pastIds),
        db.from("training_rsvps")
          .select("training_id, status")
          .in("training_id", pastIds),
      ])
    : [{ data: [] }, { data: [] }];

  // Aggregate per training
  type AttEntry = { present: number; absent: number; justified: number; late: number };
  const attMap  = new Map<string, AttEntry>();
  const rsvpMap = new Map<string, { going: number; not_going: number }>();

  for (const r of attRes.data ?? []) {
    const id = r.training_id as string;
    if (!attMap.has(id)) attMap.set(id, { present: 0, absent: 0, justified: 0, late: 0 });
    const e = attMap.get(id)!;
    const s = r.status as string;
    if (s === "present" || s === "auto_present") e.present++;
    else if (s === "late") { e.present++; e.late++; }
    else if (s === "absent")    e.absent++;
    else if (s === "justified") e.justified++;
  }

  for (const r of rsvpRes.data ?? []) {
    const id = r.training_id as string;
    if (!rsvpMap.has(id)) rsvpMap.set(id, { going: 0, not_going: 0 });
    const e = rsvpMap.get(id)!;
    if (r.status === "going")     e.going++;
    else if (r.status === "not_going") e.not_going++;
  }

  const trainings = allTrainings.map((t) => {
    const isPast = t.date < today;
    if (!isPast) {
      return { id: t.id, date: t.date, type: t.type, is_past: false,
               present: null, absent: null, justified: null, late: null,
               total_records: null, pct: null, rsvp_going: null, rsvp_not_going: null };
    }
    const att  = attMap.get(t.id)  ?? { present: 0, absent: 0, justified: 0, late: 0 };
    const rsvp = rsvpMap.get(t.id) ?? { going: 0, not_going: 0 };
    const total   = att.present + att.absent + att.justified;
    const pct     = total > 0 ? Math.round((att.present / total) * 100) : null;
    return {
      id: t.id, date: t.date, type: t.type, is_past: true,
      present: att.present, absent: att.absent, justified: att.justified, late: att.late,
      total_records: total, pct,
      rsvp_going: rsvp.going, rsvp_not_going: rsvp.not_going,
    };
  });

  const completed       = trainings.filter((t) => t.is_past && t.total_records !== null && t.total_records > 0);
  const avgPresentCount = completed.length
    ? Math.round((completed.reduce((s, t) => s + (t.present ?? 0), 0) / completed.length) * 10) / 10
    : null;
  const avgPct = completed.length
    ? Math.round((completed.reduce((s, t) => s + (t.pct ?? 0), 0) / completed.length) * 10) / 10
    : null;

  return NextResponse.json({
    summary: {
      total:         allTrainings.length,
      completed:     allTrainings.filter((t) => t.date < today).length,
      upcoming:      allTrainings.filter((t) => t.date >= today).length,
      avg_present:   avgPresentCount,
      avg_pct:       avgPct,
      squad_size:    squadSize,
    },
    trainings,
  });
}
