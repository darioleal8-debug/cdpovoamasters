import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { addDays, addWeeks, addMonths, parseISO, format, getDay, setDate } from "date-fns";

export const runtime = "nodejs";

function ok(data: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}
function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}

async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ─── GET /api/trainings?season_id=... ───────────────────
export async function GET(req: NextRequest) {
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  const seasonId = req.nextUrl.searchParams.get("season_id");
  if (!seasonId) return fail("season_id obrigatório");

  const { data, error } = await supabase
    .from("trainings")
    .select("*")
    .eq("season_id", seasonId)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) return fail(error.message, 500);
  return ok({ trainings: data ?? [] });
}

// ─── POST /api/trainings — criar treino (com recorrência) ──
export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabase();
  if (!user) return fail("Não autenticado", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const {
    season_id, date, start_time, end_time, location, type = "geral",
    notes, recurrence_type = "unique", day_of_week, day_of_month, end_date,
  } = body as Record<string, string>;

  if (!season_id || !date || !start_time) return fail("Campos obrigatórios em falta");

  // Buscar season para saber o end_date limite
  const { data: season } = await supabase
    .from("seasons")
    .select("end_date")
    .eq("id", season_id)
    .single();

  const seasonEnd = season?.end_date ? parseISO(season.end_date) : null;
  const recurrenceEnd = end_date ? parseISO(end_date) : seasonEnd;

  let recurrenceId: string | null = null;

  if (recurrence_type !== "unique") {
    const { data: rule, error: ruleErr } = await supabase
      .from("training_recurrence_rules")
      .insert({
        season_id, recurrence_type,
        day_of_week: recurrence_type === "weekly"  ? Number(day_of_week) : null,
        day_of_month: recurrence_type === "monthly" ? Number(day_of_month) : null,
        start_date: date,
        end_date: recurrenceEnd ? format(recurrenceEnd, "yyyy-MM-dd") : null,
        start_time, end_time: end_time || null,
        location: location || "", type, notes: notes || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (ruleErr) return fail(ruleErr.message, 500);
    recurrenceId = rule.id;
  }

  // Gerar datas
  const dates: string[] = [];
  const startDate = parseISO(date);
  const maxDate   = recurrenceEnd ?? (seasonEnd ?? addMonths(startDate, 12));

  if (recurrence_type === "unique") {
    dates.push(format(startDate, "yyyy-MM-dd"));
  } else if (recurrence_type === "weekly") {
    const targetDow = Number(day_of_week ?? getDay(startDate));
    let current = startDate;
    // avançar até ao primeiro dia correto
    while (getDay(current) !== targetDow) current = addDays(current, 1);
    while (current <= maxDate) {
      dates.push(format(current, "yyyy-MM-dd"));
      current = addWeeks(current, 1);
    }
  } else if (recurrence_type === "monthly") {
    const targetDom = Number(day_of_month ?? startDate.getDate());
    let current = setDate(startDate, targetDom);
    if (current < startDate) current = addMonths(current, 1);
    while (current <= maxDate) {
      dates.push(format(current, "yyyy-MM-dd"));
      current = addMonths(current, 1);
      current = setDate(current, targetDom);
    }
  }

  if (dates.length === 0) return fail("Nenhuma data gerada com os parâmetros fornecidos");

  const rows = dates.map((d) => ({
    season_id, date: d, start_time, end_time: end_time || null,
    location: location || "", type, notes: notes || null,
    recurrence_id: recurrenceId, created_by: user.id,
  }));

  const { data: created, error: insErr } = await supabase
    .from("trainings")
    .upsert(rows, { onConflict: "season_id,date,start_time,location", ignoreDuplicates: true })
    .select("id, date");

  if (insErr) return fail(insErr.message, 500);

  return ok({
    created: created?.length ?? 0,
    dates_generated: dates.length,
    recurrence_id: recurrenceId,
  }, 201);
}
