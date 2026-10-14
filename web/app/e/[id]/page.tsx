import type { Metadata } from "next";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, Clock, LogIn, MapPin } from "lucide-react";
import { EventVoteClient } from "./event-vote-client";

type Props = { params: Promise<{ id: string }> };

// ─── Service-role client (no auth required — used for OG meta + event lookup) ──

function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ─── Training type labels ──────────────────────────────────────────────────────

const TRAINING_TYPE_LABELS: Record<string, string> = {
  tecnico: "Técnico", fisico: "Físico", tatico: "Tático",
  recuperacao: "Recuperação", coletivo: "Coletivo",
  individual: "Individual", geral: "Geral",
};

// ─── Event metadata ────────────────────────────────────────────────────────────

type EventMeta = {
  id: string;
  kind: "game" | "training";
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  isPast: boolean;
  isDeadlinePassed: boolean;
  notes: string | null;
  seasonId: string | null;
};

async function fetchEventMeta(id: string): Promise<EventMeta | null> {
  const db = adminDb();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Try game from events table (type = 'jogo')
  const { data: game } = await db
    .from("events")
    .select("id, title, event_date, event_time, location, season_id")
    .eq("id", id)
    .eq("type", "jogo")
    .maybeSingle();

  if (game) {
    const date = game.event_date as string;
    const time = game.event_time ? (game.event_time as string).slice(0, 5) : null;
    const eventDt = new Date(`${date}T${time ?? "23:59"}:00`);
    const now = new Date();
    return {
      id: game.id as string,
      kind: "game",
      title: (game.title as string) ?? "Jogo",
      date,
      time,
      location: (game.location as string) ?? null,
      isPast: now > eventDt,
      isDeadlinePassed: now > eventDt,
      notes: null,
      seasonId: (game.season_id as string) ?? null,
    };
  }

  // 2. Try training from trainings table
  const { data: training } = await db
    .from("trainings")
    .select("id, date, start_time, location, type, notes, season_id, rsvp_deadline_hours")
    .eq("id", id)
    .maybeSingle();

  if (training) {
    const date = training.date as string;
    const time = training.start_time ? (training.start_time as string).slice(0, 5) : null;
    const eventDt = new Date(`${date}T${time ?? "23:59"}:00`);
    const deadlineHours = (training.rsvp_deadline_hours as number | null) ?? 3;
    const deadlineDt = new Date(eventDt.getTime() - deadlineHours * 60 * 60 * 1000);
    const now = new Date();
    const typeLabel = training.type
      ? (TRAINING_TYPE_LABELS[training.type as string] ?? null)
      : null;
    return {
      id: training.id as string,
      kind: "training",
      title: typeLabel ? `Treino · ${typeLabel}` : "Treino",
      date,
      time,
      location: (training.location as string) ?? null,
      isPast: now > eventDt,
      isDeadlinePassed: now > deadlineDt,
      notes: (training.notes as string) ?? null,
      seasonId: (training.season_id as string) ?? null,
    };
  }

  return null;
}

// ─── generateMetadata — accessible without auth (WhatsApp / social crawler) ───

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ev = await fetchEventMeta(id);
  if (!ev) return { title: "Evento — hoophub" };

  const dateStr = new Date(ev.date + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long",
  });
  const cap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  const ogTitle = `${ev.title} · ${cap}`;
  const ogDesc = ev.isPast
    ? "Este evento já terminou."
    : `Confirma a tua disponibilidade${ev.time ? ` — ${ev.time}h` : ""}${ev.location ? `, ${ev.location}` : ""}.`;

  return {
    title: ogTitle,
    description: ogDesc,
    openGraph: {
      title: ogTitle,
      description: ogDesc,
      type: "website",
      siteName: "hoophub",
    },
    twitter: {
      card: "summary",
      title: ogTitle,
      description: ogDesc,
    },
    robots: { index: false, follow: false },
  };
}

// ─── Date formatting ───────────────────────────────────────────────────────────

function fmtDate(date: string): string {
  const d = new Date(date + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EventSharePage({ params }: Props) {
  const { id } = await params;

  // Event metadata — service-role, no auth needed
  const ev = await fetchEventMeta(id);
  if (!ev) notFound();

  // User session — cookie-based client
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Privilege check only (no player lookup — that runs client-side so the
  // browser session is used directly, avoiding server-side cookie/RLS edge-cases).
  let isPrivileged = false;
  if (user) {
    const db = adminDb();
    const { data: roleRow } = await db
      .from("users").select("role").eq("id", user.id).maybeSingle();
    isPrivileged = ["admin", "treinador", "seccionista"].includes(
      (roleRow as { role: string } | null)?.role ?? ""
    );
  }

  const bgColor = ev.kind === "game" ? "var(--club-primary, #111111)" : "#3b5f92";

  return (
    <div className="min-h-dvh" style={{ background: "var(--paper, #F6F7F9)" }}>
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white font-black text-sm"
            style={{ background: "#F28C28" }}
            aria-hidden="true"
          >
            ◉
          </span>
          <span className="font-black text-[18px]" style={{ color: "var(--ink, #0A1220)" }}>
            hoop<span style={{ color: "#F28C28" }}>hub</span>
          </span>
        </div>

        {/* Event card */}
        <div className="rounded-2xl px-5 py-5 text-white" style={{ background: bgColor }}>
          <p className="text-[0.65rem] font-bold uppercase tracking-widest opacity-60 mb-1">
            {ev.kind === "game" ? "Jogo" : "Treino"}
          </p>
          <h1 className="text-xl font-bold leading-tight mb-3">{ev.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-85">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {fmtDate(ev.date)}
            </span>
            {ev.time && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {ev.time}h
              </span>
            )}
            {ev.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {ev.location}
              </span>
            )}
          </div>
          {ev.notes && (
            <p className="mt-3 text-sm opacity-70 leading-relaxed">{ev.notes}</p>
          )}
        </div>

        {/* Past banner */}
        {ev.isPast && (
          <div
            className="rounded-xl px-4 py-3 text-sm font-medium text-center"
            style={{
              background: "rgba(90,100,120,.08)",
              color: "var(--muted-text, #5A6478)",
              border: "1px solid var(--line, #E4E7EE)",
            }}
          >
            Este evento já terminou
          </div>
        )}

        {/* Auth gate */}
        {!user ? (
          <div
            className="rounded-2xl p-6 text-center space-y-4 bg-card"
            style={{ border: "1px solid var(--line, #E4E7EE)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--ink, #0A1220)" }}>
              {ev.isPast
                ? "Entra para ver as respostas"
                : "Entra para confirmar a tua disponibilidade"}
            </p>
            <Link
              href={`/login?redirectTo=/e/${id}`}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white"
              style={{ background: "var(--action, #F97316)" }}
            >
              <LogIn className="h-4 w-4" />
              Entrar no hoophub
            </Link>
          </div>
        ) : (
          <EventVoteClient
            eventId={id}
            eventKind={ev.kind}
            isPast={ev.isPast}
            isDeadlinePassed={ev.isDeadlinePassed}
            seasonId={ev.seasonId}
            isPrivileged={isPrivileged}
          />
        )}

      </div>
    </div>
  );
}
