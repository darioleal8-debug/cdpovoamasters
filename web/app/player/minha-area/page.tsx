import { todayInClubTz } from "@/lib/time/club-time";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/auth/guards";
import { redirect } from "next/navigation";
import {
  AlertTriangle, BarChart2, Calendar, CreditCard,
  Dumbbell, MessageSquare, Trophy, User,
} from "lucide-react";
import { StatsSection } from "@/components/player/stats-section";
import { lisbonDateTime } from "@/lib/event-time";
import { isAttendanceOpen, attendanceCloseHHMM } from "@/lib/time/attendance-window";
import { pickNextTraining } from "@/lib/time/pick-next-training";
import { GpsCheckinButton } from "@/components/trainings/gps-checkin-button";
import type { AvailabilityRosterRow } from "@/types/availability";
import { BirthdayBanner } from "@/components/birthday/birthday-banner";
import Link from "next/link";
import { MinhaAreaTop, type TrainingData, type GameData } from "@/components/player/minha-area-top";

export const metadata = { title: "Minha Área" };

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TrainingRow = {
  id:         string;
  date:       string;
  start_time: string | null;
  end_time:   string | null;
  location:   string | null;
  type:       string | null;
  notes:      string | null;
  rsvp_deadline_hours: number | null;
  deleted_at: string | null;
};

type ComunicadoRow = {
  id:          string;
  content:     string | null;
  created_at:  string;
  sender_name: string;
  sender_role: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `há ${Math.max(0, mins)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs} h`;
  return `há ${Math.floor(hrs / 24)} dias`;
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// ── Página principal ──────────────────────────────────────────────────────────

export default async function MinhaAreaPage() {
  const authz = await authorize();
  if (!authz.ok) redirect(authz.response.status === 401 ? "/login" : "/login?reason=inactive");
  const supabase = await createClient();
  const user = authz.user;

  const { data: profile } = await supabase
    .from("users")
    .select("name, role")
    .eq("id", user.id)
    .single();

  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id")
    .eq("status", "ativa")
    .maybeSingle();

  // Perfil de jogador ligado à época ativa; senão o mais recente
  let linkedPlayer: { id: string } | null = null;
  if (activeSeason) {
    const { data } = await supabase
      .from("players").select("id")
      .eq("user_id", user.id).eq("season_id", activeSeason.id)
      .maybeSingle();
    linkedPlayer = data;
  }
  if (!linkedPlayer) {
    const { data } = await supabase
      .from("players").select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    linkedPlayer = data;
  }

  // ── Pagamentos em atraso ──────────────────────────────────
  let isPaymentLate = false;
  if (linkedPlayer?.id && activeSeason?.id) {
    const { data: paymentSummary } = await supabase
      .from("player_payment_summary")
      .select("months_late")
      .eq("player_id", linkedPlayer.id)
      .eq("season_id", activeSeason.id)
      .maybeSingle();
    isPaymentLate = (paymentSummary?.months_late ?? 0) > 0;
  }

  // ── Próximo treino ────────────────────────────────────────
  const now = new Date();
  const today = todayInClubTz(now);
  const yesterday = todayInClubTz(new Date(now.getTime() - 86_400_000));

  const { data: nextTrainingRows } = activeSeason?.id
    ? await supabase
        .from("trainings")
        .select("id, date, start_time, end_time, location, type, notes, rsvp_deadline_hours, deleted_at")
        .eq("season_id", activeSeason.id)
        .is("deleted_at", null)
        .gte("date", yesterday)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(5)
    : { data: null };

  const nextTraining = pickNextTraining(
    (nextTrainingRows ?? []) as TrainingRow[],
    now,
  );

  // ── Nota do treino ────────────────────────────────────────
  let trainingNote: string | null = null;
  if (nextTraining) {
    if (nextTraining.notes?.trim()) {
      trainingNote = nextTraining.notes.trim();
    } else {
      const { data: dbNote } = await supabase
        .from("training_notes")
        .select("note_text")
        .eq("training_id", nextTraining.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      trainingNote = (dbNote as { note_text: string } | null)?.note_text ?? null;
    }
  }

  // ── RSVP do treino ────────────────────────────────────────
  let trainingAnswer: "yes" | "no" | null = null;
  let trainingRoster: AvailabilityRosterRow[] = [];

  if (nextTraining && linkedPlayer?.id) {
    const [{ data: ownRsvp }, { data: rosterRows }] = await Promise.all([
      supabase
        .from("training_rsvps")
        .select("status")
        .eq("training_id", nextTraining.id)
        .eq("player_id", linkedPlayer.id)
        .maybeSingle(),
      supabase.rpc("training_rsvp_roster", { p_training_id: nextTraining.id }),
    ]);
    trainingAnswer =
      ownRsvp?.status === "going"     ? "yes"
      : ownRsvp?.status === "not_going" ? "no"
      : null;
    trainingRoster = (rosterRows ?? []) as AvailabilityRosterRow[];
  }

  // ── Check-in GPS ──────────────────────────────────────────
  const checkinOpen = nextTraining ? isAttendanceOpen(nextTraining, now) : false;
  const closeHHMM   = checkinOpen && nextTraining ? attendanceCloseHHMM(nextTraining) : null;

  let hasTrainingAttendance = false;
  if (nextTraining && linkedPlayer?.id && checkinOpen) {
    const { data: att } = await supabase
      .from("training_attendance")
      .select("id")
      .eq("training_id", nextTraining.id)
      .eq("player_id", linkedPlayer.id)
      .in("status", ["present", "late", "auto_present"])
      .maybeSingle();
    hasTrainingAttendance = att !== null;
  }

  // ── Próximo jogo (inline para calcular pending + evitar re-render) ────────────
  const { data: nextGameRaw } = await supabase
    .from("events")
    .select("id, title, event_date, event_time, location, description, opponent")
    .eq("type", "jogo")
    .eq("is_club_game", true)
    .is("deleted_at", null)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Parse gameMeta from description
  let gameMeta: { home_team: string; away_team: string; is_home: boolean } | null = null;
  if (nextGameRaw?.description) {
    try {
      const m = JSON.parse(nextGameRaw.description as string) as { home_team?: unknown; away_team?: unknown; is_home?: unknown };
      if (m.home_team && m.away_team && typeof m.is_home === "boolean") {
        gameMeta = { home_team: String(m.home_team), away_team: String(m.away_team), is_home: m.is_home };
      }
    } catch { /* silently ignore */ }
  }

  const nextGame: GameData | null = nextGameRaw
    ? {
        id:         nextGameRaw.id as string,
        event_date: nextGameRaw.event_date as string,
        event_time: nextGameRaw.event_time as string | null,
        location:   nextGameRaw.location as string | null,
        opponent:   nextGameRaw.opponent as string | null,
        title:      nextGameRaw.title as string,
        gameMeta,
      }
    : null;

  // ── Disponibilidade no jogo ───────────────────────────────
  let gameAnswer: "yes" | "no" | null = null;
  if (nextGame && linkedPlayer?.id) {
    const { data: av } = await supabase
      .from("game_availability")
      .select("status")
      .eq("game_id", nextGame.id)
      .eq("player_id", linkedPlayer.id)
      .maybeSingle();
    if (av?.status === "available")   gameAnswer = "yes";
    if (av?.status === "unavailable") gameAnswer = "no";
  }

  // Confirmados no jogo (respostas "available")
  const { count: gameConfirmedCount } = nextGame
    ? await supabase
        .from("game_availability")
        .select("*", { count: "exact", head: true })
        .eq("game_id", nextGame.id)
        .eq("status", "available")
    : { count: 0 };

  const trainingConfirmedCount = trainingRoster.filter((r) => r.status === "going").length;

  // Deadline para os cartões (abertura de botões)
  const trainingDeadlineIso = nextTraining
    ? lisbonDateTime(nextTraining.date, nextTraining.start_time).toISOString()
    : null;
  const gameDeadlineIso = nextGame
    ? lisbonDateTime(nextGame.event_date, nextGame.event_time).toISOString()
    : null;

  // ── Comunicados ───────────────────────────────────────────
  let comunicados: ComunicadoRow[] = [];
  try {
    const admin = await createAdminClient();
    const { data: teamChat } = await admin
      .from("chats")
      .select("id")
      .eq("type", "announcement")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (teamChat?.id) {
      const { data: msgs } = await admin
        .from("chat_messages")
        .select("id, content, created_at, sender_id")
        .eq("chat_id", teamChat.id)
        .eq("is_system", false)
        .is("hidden_at", null)
        .order("created_at", { ascending: false })
        .limit(3);

      if (msgs && msgs.length > 0) {
        const senderIds = [
          ...new Set(
            (msgs as Array<{ sender_id: string | null }>)
              .map((m) => m.sender_id)
              .filter((id): id is string => id !== null)
          ),
        ];
        const { data: senders } = senderIds.length > 0
          ? await supabase.from("user_display_names").select("id, name, role").in("id", senderIds)
          : { data: [] };
        const senderById = new Map(
          ((senders ?? []) as Array<{ id: string; name: string; role: string }>)
            .map((s) => [s.id, s])
        );
        comunicados = (msgs as Array<{ id: string; content: string | null; created_at: string; sender_id: string | null }>)
          .map((m) => {
            const sender = m.sender_id ? senderById.get(m.sender_id) : undefined;
            return {
              id:          m.id,
              content:     m.content,
              created_at:  m.created_at,
              sender_name: sender?.name ?? "Equipa",
              sender_role: sender?.role ?? "",
            };
          });
      }
    }
  } catch { /* Comunicados não-fatal */ }

  const name = profile?.name || user.email || "Jogador";
  const firstName = name.split(" ").filter(Boolean)[0] ?? name;

  // Atalhos de navegação rápida
  const shortcuts = [
    { href: "/player/meu-perfil",      icon: User,       label: "O Meu Perfil",       desc: "Ver e editar"      },
    { href: "/player/meus-jogos",      icon: Calendar,   label: "Os Meus Jogos",      desc: "Próximos jogos"    },
    { href: "/player/meus-treinos",    icon: Dumbbell,   label: "Os Meus Treinos",    desc: "Agenda de treinos" },
    { href: "/player/assiduidade",     icon: BarChart2,  label: "A Minha Assiduidade",desc: "Treinos e jogos"   },
    { href: "/player/meus-pagamentos", icon: CreditCard, label: "Os Meus Pagamentos", desc: "Quotas"            },
    { href: "/player/palmares",        icon: Trophy,     label: "Palmarés",           desc: "Historial"         },
  ] as const;

  const trainingData: TrainingData | null = nextTraining
    ? {
        id:         nextTraining.id,
        date:       nextTraining.date,
        start_time: nextTraining.start_time,
        end_time:   nextTraining.end_time,
        location:   nextTraining.location,
        type:       nextTraining.type,
      }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Cartões de evento (client component com disponibilidade) ── */}
      <MinhaAreaTop
        playerFirstName={firstName}
        training={trainingData}
        trainingAnswer={trainingAnswer}
        trainingConfirmedCount={trainingConfirmedCount}
        trainingDeadlineIso={trainingDeadlineIso}
        gameData={nextGame}
        gameAnswer={gameAnswer}
        gameConfirmedCount={gameConfirmedCount ?? 0}
        gameDeadlineIso={gameDeadlineIso}
        noPlayerProfile={linkedPlayer === null}
      />

      {/* ── Aviso de quotas em atraso ── */}
      {isPaymentLate && (
        <div
          style={{
            borderRadius: "8px",
            border: "1px solid rgba(249,115,22,.4)",
            background: "rgba(249,115,22,.08)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
          <AlertTriangle size={18} style={{ color: "#F97316", flexShrink: 0, marginTop: "1px" }} />
          <div>
            <p style={{ fontFamily: "var(--font-barlow-condensed, sans-serif)", fontWeight: 700, fontSize: "14px", letterSpacing: ".04em", textTransform: "uppercase", color: "#1A1612", marginBottom: "4px" }}>
              Quotas em atraso
            </p>
            <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "13px", color: "#6F675F" }}>
              Tens quotas por pagar. Enquanto não regularizares, não poderás ser convocado para jogos.{" "}
              <Link href="/player/meus-pagamentos" style={{ color: "#C2530A", fontWeight: 600 }}>
                Ver pagamentos
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* ── Aniversários ── */}
      <BirthdayBanner isAdmin={false} />

      {/* ── Check-in GPS (janela aberta) ── */}
      {checkinOpen && linkedPlayer && !hasTrainingAttendance && nextTraining && (
        <div
          style={{
            background: "#FFFDFA",
            borderRadius: "8px",
            boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.25)",
            padding: "16px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#8C837A",
              marginBottom: "8px",
            }}
          >
            Marcar presença{closeHHMM ? ` · fecha às ${closeHHMM}h` : ""}
          </p>
          <GpsCheckinButton trainingId={nextTraining.id} />
        </div>
      )}

      {/* ── Foco do treino ── */}
      {nextTraining && trainingNote && (
        <div
          style={{
            background: "#FFFDFA",
            borderRadius: "8px",
            boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.25)",
            padding: "16px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#8C837A",
              marginBottom: "8px",
            }}
          >
            Foco do treino
          </p>
          <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "14px", color: "#1A1612", lineHeight: 1.5 }}>
            {trainingNote}
          </p>
        </div>
      )}

      {/* ── Linha 2: Estatísticas + Comunicados ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <StatsSection seasonId={activeSeason?.id ?? null} />
        </div>
        <div>
          <div
            style={{
              background: "#FFFDFA",
              borderRadius: "8px",
              boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.25)",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(26,22,18,.06)", display: "flex", alignItems: "center", gap: "8px" }}>
              <MessageSquare size={14} style={{ color: "#8C837A" }} />
              <span style={{ fontFamily: "var(--font-barlow-condensed, sans-serif)", fontWeight: 700, fontSize: "14px", letterSpacing: ".04em", textTransform: "uppercase", color: "#1A1612" }}>
                Comunicados
              </span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {comunicados.length === 0 ? (
                <div style={{ padding: "16px", flex: 1, display: "flex", alignItems: "center" }}>
                  <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "13px", color: "#8C837A" }}>
                    Sem comunicados recentes.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {comunicados.map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        padding: "12px 16px",
                        borderBottom: i < comunicados.length - 1 ? "1px solid rgba(26,22,18,.06)" : undefined,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: "#1A1612",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            fontFamily: "var(--font-barlow-condensed, sans-serif)",
                            fontWeight: 700,
                            fontSize: "11px",
                            color: "#fff",
                            letterSpacing: ".04em",
                          }}
                        >
                          {initials(c.sender_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
                            <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "12px", fontWeight: 600, color: "#1A1612", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.sender_name}
                            </p>
                            <p style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", color: "#8C837A", flexShrink: 0 }}>
                              {relTime(c.created_at)}
                            </p>
                          </div>
                          <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "12px", color: "#6F675F", marginTop: "4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {c.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(26,22,18,.06)" }}>
              <Link href="/player/chat" style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "12px", fontWeight: 600, color: "#C2530A" }}>
                Ver tudo no chat →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Atalhos de navegação rápida ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {shortcuts.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              borderRadius: "8px",
              background: "#FFFDFA",
              boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 4px 12px -6px rgba(26,22,18,.15)",
              padding: "16px 12px",
              textAlign: "center",
              textDecoration: "none",
              transition: "box-shadow .15s",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                background: "#F4EFE8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={18} style={{ color: "#1A1612" }} />
            </div>
            <div>
              <p style={{ fontFamily: "var(--font-barlow-condensed, sans-serif)", fontWeight: 700, fontSize: "13px", letterSpacing: ".04em", textTransform: "uppercase", color: "#1A1612" }}>
                {label}
              </p>
              <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "11px", color: "#8C837A" }}>
                {desc}
              </p>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
