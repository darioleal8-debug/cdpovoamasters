import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fmtDate(date: string): string {
  // date = "YYYY-MM-DD" → "YYYYMMDD"
  return date.replace(/-/g, "");
}

function fmtDatetime(date: string, time: string | null): string {
  if (!time) return `${fmtDate(date)}T000000`;
  const t = time.slice(0, 5).replace(":", "");
  return `${fmtDate(date)}T${t}00`;
}

function uid(id: string, suffix: string): string {
  return `${id}-${suffix}@hoophub.pt`;
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Obter a época ativa
  const { data: season } = await supabase
    .from("seasons")
    .select("id, name")
    .eq("status", "ativa")
    .maybeSingle();

  if (!season) {
    return new NextResponse("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//HoopHub//PT\r\nEND:VCALENDAR", {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hoophub.ics"',
      },
    });
  }

  // Buscar jogos e treinos em paralelo
  const [gamesRes, trainingsRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, opponent, event_date, event_time, location, competition, game_type")
      .eq("season_id", season.id)
      .eq("type", "jogo")
      .is("is_test", false)
      .order("event_date", { ascending: true }),
    supabase
      .from("trainings")
      .select("id, date, start_time, end_time, location, type, foco, notes")
      .eq("season_id", season.id)
      .is("deleted_at", null)
      .order("date", { ascending: true }),
  ]);

  const games     = gamesRes.data    ?? [];
  const trainings = trainingsRes.data ?? [];

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//HoopHub//Época ${escapeIcs(season.name)}//PT`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:HoopHub — ${escapeIcs(season.name)}`,
    "X-WR-TIMEZONE:Europe/Lisbon",
  ];

  for (const g of games) {
    const summary  = g.title ?? (g.opponent ? `vs ${g.opponent}` : "Jogo");
    const dtstart  = fmtDatetime(g.event_date, g.event_time);
    const dtend    = fmtDatetime(g.event_date, g.event_time ? `${(parseInt(g.event_time.slice(0, 2)) + 2).toString().padStart(2, "0")}:${g.event_time.slice(3, 5)}` : null);
    const location = g.location ?? "";
    const desc     = [g.competition, g.game_type === "away" ? "Fora" : "Casa"].filter(Boolean).join(" · ");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid(g.id, "game")}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${escapeIcs(summary)}`,
      ...(location ? [`LOCATION:${escapeIcs(location)}`] : []),
      ...(desc ? [`DESCRIPTION:${escapeIcs(desc)}`] : []),
      "CATEGORIES:Jogo",
      "END:VEVENT",
    );
  }

  const TRAINING_LABELS: Record<string, string> = {
    tecnico: "Técnico", fisico: "Físico", tatico: "Tático",
    recuperacao: "Recuperação", coletivo: "Coletivo",
    individual: "Individual", geral: "Geral",
  };

  for (const t of trainings) {
    const typeLabel = TRAINING_LABELS[t.type as string] ?? t.type;
    const summary   = t.foco ? `Treino — ${t.foco}` : `Treino (${typeLabel})`;
    const dtstart   = fmtDatetime(t.date, t.start_time);
    const dtend     = t.end_time
      ? fmtDatetime(t.date, t.end_time)
      : fmtDatetime(t.date, t.start_time
          ? `${(parseInt(t.start_time.slice(0, 2)) + 2).toString().padStart(2, "0")}:${t.start_time.slice(3, 5)}`
          : null);
    const location  = t.location ?? "";
    const desc      = [typeLabel, t.notes].filter(Boolean).join(" · ");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid(t.id, "training")}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${escapeIcs(summary)}`,
      ...(location ? [`LOCATION:${escapeIcs(location)}`] : []),
      ...(desc ? [`DESCRIPTION:${escapeIcs(desc)}`] : []),
      "CATEGORIES:Treino",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="hoophub.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
