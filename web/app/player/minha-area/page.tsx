import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  AlertTriangle, Calendar, Clock, CreditCard,
  Dumbbell, MapPin, MessageSquare, Trophy, User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NextGameCard } from "@/components/games/next-game-card";
import { StatsSection } from "@/components/player/stats-section";
import Link from "next/link";

export const metadata = { title: "Minha Área" };

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TrainingRow = {
  id:         string;
  date:       string;
  start_time: string | null;
  location:   string | null;
  type:       string | null;
  notes:      string | null;
};

type ComunicadoRow = {
  id:          string;
  content:     string | null;
  created_at:  string;
  sender_name: string;
  sender_role: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  tecnico: "Técnico", fisico: "Físico", tatico: "Tático",
  recuperacao: "Recuperação", coletivo: "Coletivo",
  individual: "Individual", geral: "Geral",
};

function dateLabel(dateStr: string): string {
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  const tMs     = new Date(dateStr + "T00:00:00").getTime();
  const diff    = Math.round((tMs - todayMs) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return `Em ${diff} dias`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

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

// ── Cartão Próximo Treino ─────────────────────────────────────────────────────

function NextTrainingCard({
  training,
  note,
}: {
  training: TrainingRow | null;
  note:     string | null;
}) {
  const TRAINING_BG = "#3b5f92";

  if (!training) {
    return (
      <div className="overflow-hidden rounded-xl border shadow-sm flex flex-col">
        <div className="px-5 py-5" style={{ backgroundColor: TRAINING_BG, color: "#fff" }}>
          <span className="text-[0.65rem] font-bold uppercase tracking-widest opacity-60">
            Próximo Treino
          </span>
          <p className="mt-3 text-sm opacity-70">Sem treinos agendados.</p>
        </div>
        <div className="bg-background flex-1 px-5 py-4" />
      </div>
    );
  }

  const label   = dateLabel(training.date);
  const isToday = label === "Hoje";
  const typeLabel = training.type ? (TYPE_LABELS[training.type] ?? training.type) : null;

  return (
    <div className="overflow-hidden rounded-xl border shadow-sm flex flex-col">
      {/* ── Topo colorido ── */}
      <div className="relative px-5 py-5" style={{ backgroundColor: TRAINING_BG, color: "#fff" }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[0.65rem] font-bold uppercase tracking-widest opacity-60">
            Próximo Treino
          </span>
          <Badge
            className="text-[10px] font-semibold"
            style={{
              backgroundColor: isToday
                ? "var(--club-secondary, #F28C28)"
                : "rgba(255,255,255,0.15)",
              color:  "#fff",
              border: "none",
            }}
          >
            {label}
          </Badge>
        </div>

        <h2 className="mb-3 text-lg font-bold leading-tight">
          Treino{typeLabel ? ` · ${typeLabel}` : ""}
        </h2>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm opacity-80">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {fmtDate(training.date)}
          </span>
          {training.start_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {training.start_time.slice(0, 5)}h
            </span>
          )}
          {training.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {training.location}
            </span>
          )}
        </div>
      </div>

      {/* ── Zona branca — Foco do treino ── */}
      <div className="bg-background flex-1 px-5 py-4">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Foco do treino
        </p>
        {note ? (
          <p className="text-sm text-foreground/80 leading-relaxed">{note}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Sem notas para este treino.</p>
        )}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default async function MinhaAreaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, role")
    .eq("id", user.id)
    .single();

  const today = new Date().toISOString().slice(0, 10);

  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id")
    .eq("status", "ativa")
    .maybeSingle();

  const { data: linkedPlayer } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

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
  const { data: nextTrainingRaw } = activeSeason?.id
    ? await supabase
        .from("trainings")
        .select("id, date, start_time, location, type, notes")
        .eq("season_id", activeSeason.id)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const nextTraining = nextTrainingRaw as TrainingRow | null;

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

  // ── Comunicados (chat de equipa, importante = true) ───────
  let comunicados: ComunicadoRow[] = [];
  try {
    const { data: teamChat } = await supabase
      .from("chats")
      .select("id")
      .eq("type", "team")
      .limit(1)
      .maybeSingle();

    if (teamChat?.id) {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id, content, created_at, sender_id")
        .eq("chat_id", teamChat.id)
        .eq("importante", true)
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
          ? await supabase.from("users").select("id, name, role").in("id", senderIds)
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
  } catch {
    // Comunicados não-fatal — se falhar, mostra lista vazia
  }

  const name = profile?.name || user.email || "Jogador";

  // ── Atalhos ───────────────────────────────────────────────
  const shortcuts = [
    { href: "/player/meu-perfil",      icon: User,           label: "O Meu Perfil",       desc: "Ver e editar"       },
    { href: "/player/meus-jogos",      icon: Calendar,       label: "Os Meus Jogos",      desc: "Próximos jogos"     },
    { href: "/player/meus-treinos",    icon: Dumbbell,       label: "Os Meus Treinos",    desc: "Agenda de treinos"  },
    { href: "/player/meus-pagamentos", icon: CreditCard,     label: "Os Meus Pagamentos", desc: "Quotas"             },
    { href: "/palmares",               icon: Trophy,         label: "Palmarés",            desc: "Historial"          },
  ] as const;

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Olá, {name.split(" ")[0]}!</h1>
        <p className="text-muted-foreground">Bem-vindo à tua área pessoal.</p>
      </div>

      {/* ── Aviso de quotas em atraso ── */}
      {isPaymentLate && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 dark:border-amber-700/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Quotas em atraso
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Tens quotas por pagar. Enquanto não regularizares a situação, não poderás ser convocado para jogos.{" "}
                <Link href="/player/meus-pagamentos" className="underline font-medium">
                  Ver pagamentos
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Par de cartões: Próximo Jogo + Próximo Treino ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NextGameCard highlightPlayerId={linkedPlayer?.id ?? null} />
        <NextTrainingCard training={nextTraining} note={trainingNote} />
      </div>

      {/* ── Linha 2: Estatísticas (2/3) + Comunicados (1/3) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

        {/* Estatísticas */}
        <div className="sm:col-span-2">
          <StatsSection seasonId={activeSeason?.id ?? null} />
        </div>

        {/* Comunicados */}
        <div>
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full">
            {/* Cabeçalho do cartão */}
            <div className="px-4 pt-4 pb-3 border-b flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Comunicados</span>
            </div>

            {/* Lista */}
            <div className="flex-1 flex flex-col divide-y overflow-hidden">
              {comunicados.length === 0 ? (
                <div className="px-4 py-5 flex-1 flex items-center">
                  <p className="text-sm text-muted-foreground">Sem comunicados recentes.</p>
                </div>
              ) : (
                comunicados.map((c) => (
                  <div key={c.id} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      {/* Avatar */}
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: "var(--club-primary, #1d4079)" }}
                      >
                        {initials(c.sender_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-semibold truncate">{c.sender_name}</p>
                          <p className="text-[10px] text-muted-foreground shrink-0">{relTime(c.created_at)}</p>
                        </div>
                        {c.sender_role && (
                          <p className="text-[10px] text-muted-foreground capitalize">{c.sender_role}</p>
                        )}
                        <p className="text-xs text-foreground/80 mt-1 line-clamp-2 leading-relaxed">
                          {c.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé */}
            <div className="px-4 py-3 border-t">
              <Link
                href="/player/chat"
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--club-primary, #1d4079)" }}
              >
                Ver tudo no chat →
              </Link>
            </div>
          </div>
        </div>

      </div>

      {/* ── Atalhos de navegação rápida ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {shortcuts.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-all hover:shadow-md"
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--club-bg, #eeeeee)", color: "var(--club-primary, #111111)" }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
