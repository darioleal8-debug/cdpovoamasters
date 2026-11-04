import { todayInClubTz } from "@/lib/time/club-time";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { authorize } from "@/lib/auth/guards";
import { ArrowLeft, Calendar, Check, Clock, HelpCircle, MapPin, Shield, Users, X, Trophy } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AvailabilityRosterRow } from "@/types/availability";
import { AvailabilityPrompt } from "@/components/player/availability-prompt";
import { CallupNotice } from "@/components/player/callup-notice";
import { lisbonDateTime } from "@/lib/event-time";
import { hasAnyRole, MANAGERS } from "@/lib/auth/roles";
import type { UserRole } from "@/types/database";

type Props = { params: Promise<{ id: string }> };

const POSITION_LABELS: Record<string, string> = {
  base: "Base", extremo: "Extremo", poste: "Poste",
};

const REASON_LABELS: Record<string, string> = {
  lesao: "Lesão", trabalho: "Trabalho", compromisso: "Compromisso pessoal",
  doenca: "Doença", viagem: "Viagem", outro: "Outro",
};

function fmtDate(d: string, t?: string | null): string {
  const day = new Date(d + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const cap = day.charAt(0).toUpperCase() + day.slice(1);
  return t ? `${cap} · ${t.slice(0, 5)}h` : cap;
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function AvailRow({ row }: { row: AvailabilityRosterRow }) {
  const isAvailable = row.status === "available";
  const noResponse  = !row.status;
  const reason = row.reason_code
    ? (REASON_LABELS[row.reason_code] ?? row.reason_code)
    : row.reason_text ?? null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-b-0">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: noResponse ? "#9ca3af" : isAvailable ? "#3b5f92" : "#ef4444" }}
      >
        {initials(row.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">
          {row.jersey_number ? <span className="text-muted-foreground mr-1">#{row.jersey_number}</span> : null}
          {row.name}
        </p>
        {reason && (
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">{reason}</p>
        )}
      </div>
    </div>
  );
}

export default async function GameDetailPage({ params }: Props) {
  const { id } = await params;
  const authz = await authorize();
  if (!authz.ok) redirect(authz.response.status === 401 ? "/login" : "/login?reason=inactive");
  const supabase = await createClient();
  const user = authz.user;

  // Fetch user role
  const { data: profile } = await supabase
    .from("users")
    .select("role, roles_extra")
    .eq("id", user.id)
    .maybeSingle();
  // Papéis reais da conta (primário ou secundário) — treinador/seccionista/admin
  // veem as disponibilidades do plantel. A RPC volta a validar do lado da BD.
  const isTrainerOrAbove = !!profile && hasAnyRole(
    { role: profile.role as UserRole, roles_extra: (profile.roles_extra as string[] | null) ?? [] },
    MANAGERS,
  );

  // Fetch game event
  const { data: event } = await supabase
    .from("events")
    .select("id, title, event_date, event_time, location, opponent, description, season_id")
    .eq("id", id)
    .eq("type", "jogo")
    .maybeSingle();

  if (!event) notFound();

  const today = todayInClubTz(new Date());
  const isPast = (event.event_date as string) < today;

  // Fetch game result if past
  const { data: session } = isPast
    ? await supabase.from("game_sessions")
        .select("home_score, away_score, status")
        .eq("event_id", id)
        .eq("status", "finished")
        .maybeSingle()
    : { data: null };

  // Perfis de jogador do utilizador — há um por época, por isso escolhemos o
  // da época do jogo (senão o mais recente). Antes usava-se sempre o mais
  // recente, o que fazia jogadores convocados verem "Não estás convocado".
  const { data: myPlayersRaw } = await supabase
    .from("players")
    .select("id, season_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const myPlayers = (myPlayersRaw ?? []) as { id: string; season_id: string | null }[];
  const myPlayerIds = myPlayers.map((p) => p.id);
  const linkedPlayer =
    myPlayers.find((p) => p.season_id && p.season_id === (event.season_id as string | null)) ??
    myPlayers[0] ??
    null;

  // Convocados — a lista é visível a todo o plantel. A RLS de game_callups só
  // devolve ao jogador a sua própria convocatória, por isso lemos a lista
  // completa com o cliente de serviço (apenas player_id deste jogo).
  let callupsRaw: { player_id: string }[] | null = null;
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("game_callups")
      .select("player_id")
      .eq("game_id", id)
      .order("created_at", { ascending: true });
    if (!error) callupsRaw = data as { player_id: string }[];
  } catch { /* fallback abaixo */ }
  if (callupsRaw === null) {
    const { data } = await supabase
      .from("game_callups")
      .select("player_id")
      .eq("game_id", id);
    callupsRaw = (data ?? []) as { player_id: string }[];
  }

  const callupIds = callupsRaw.map((c) => c.player_id);
  let rosterRows: unknown[] | null = [];
  if (callupIds.length > 0) {
    const { data } = await supabase.from("v_roster").select("player_id, name, number, position").in("player_id", callupIds);
    rosterRows = data;
    // Se a view filtrar por RLS e vier incompleta, completa com o cliente de serviço
    if ((data?.length ?? 0) < callupIds.length) {
      try {
        const admin = await createAdminClient();
        const { data: full } = await admin.from("v_roster").select("player_id, name, number, position").in("player_id", callupIds);
        if (full && full.length > (data?.length ?? 0)) rosterRows = full;
      } catch { /* mantém o que houver */ }
    }
  }

  type RosterRow = { player_id: string; name: string; number: number | null; position: string | null };
  const rosterMap = new Map(((rosterRows ?? []) as RosterRow[]).map((r) => [r.player_id, r]));
  const callups = callupIds
    .map((pid) => rosterMap.get(pid))
    .filter((r): r is RosterRow => r !== null && r !== undefined);

  // Own availability
  let myAvailability: "available" | "unavailable" | null = null;
  if (linkedPlayer?.id) {
    const { data: avRow } = await supabase
      .from("game_availability")
      .select("status")
      .eq("game_id", id)
      .eq("player_id", linkedPlayer.id)
      .maybeSingle();
    myAvailability = (avRow?.status as "available" | "unavailable") ?? null;
  }

  // Availability roster — only populated for trainer+
  let availRoster: AvailabilityRosterRow[] = [];
  if (isTrainerOrAbove) {
    const { data: avRosterRows } = await supabase.rpc("game_availability_roster", {
      p_game_id: id,
    });
    availRoster = (avRosterRows ?? []) as AvailabilityRosterRow[];
  }

  const available   = availRoster.filter((r) => r.status === "available");
  const unavailable = availRoster.filter((r) => r.status === "unavailable");
  const pending     = availRoster.filter((r) => !r.status);

  const myIsConvocado = myPlayerIds.some((pid) => callupIds.includes(pid));

  // Parse meta from description JSON
  let gameMeta: { home_team: string; away_team: string; is_home: boolean } | null = null;
  try {
    const d = event.description as string | null;
    if (d) {
      const m = JSON.parse(d) as { home_team?: unknown; away_team?: unknown; is_home?: unknown };
      if (m.home_team && m.away_team && typeof m.is_home === "boolean") {
        gameMeta = { home_team: String(m.home_team), away_team: String(m.away_team), is_home: m.is_home };
      }
    }
  } catch { /* silently ignore */ }

  const isHome = gameMeta?.is_home ?? !((event.title as string).includes("(Fora)"));

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Voltar */}
      <div>
        <Link
          href="/player/minha-area"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Minha Área
        </Link>
      </div>

      {/* Aviso de convocatória */}
      {myIsConvocado && !isPast && (
        <CallupNotice
          gameTitle={
            gameMeta
              ? `vs ${gameMeta.is_home ? gameMeta.away_team : gameMeta.home_team}`
              : (event.opponent as string | null)
                ? `vs ${event.opponent as string}`
                : (event.title as string)
          }
          eventDate={event.event_date as string}
          eventTime={event.event_time as string | null}
          location={event.location as string | null}
        />
      )}

      {/* Info do jogo */}
      <div
        className="rounded-xl px-5 py-5 text-white"
        style={{ backgroundColor: "var(--club-primary, #111111)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest opacity-60">Jogo</p>
          <Badge
            variant={isHome ? "default" : "outline"}
            className="text-[10px]"
            style={isHome
              ? { backgroundColor: "rgba(255,255,255,0.2)", border: "none", color: "#fff" }
              : { backgroundColor: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "rgba(255,255,255,0.8)" }
            }
          >
            <Shield className="h-2.5 w-2.5 mr-1" />
            {isHome ? "Casa" : "Fora"}
          </Badge>
        </div>
        <h1 className="text-xl font-bold leading-tight mb-3">
          {gameMeta
            ? <>{gameMeta.home_team} <span className="opacity-60 font-normal text-lg">vs</span> {gameMeta.away_team}</>
            : (event.title as string)
          }
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm opacity-85">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {fmtDate(event.event_date, event.event_time)}
          </span>
          {event.event_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {event.event_time.slice(0, 5)}h
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {event.location}
            </span>
          )}
        </div>
      </div>

      {/* Resultado Final */}
      {session && (
        (() => {
          const won  = (session.home_score as number) > (session.away_score as number);
          const lost = (session.home_score as number) < (session.away_score as number);
          return (
            <div
              className="rounded-xl px-5 py-4 flex items-center gap-5"
              style={{
                background: won ? "#f0fdf4" : lost ? "#fff1f2" : "#f9fafb",
                border: `1.5px solid ${won ? "#86efac" : lost ? "#fca5a5" : "#e5e7eb"}`,
              }}
            >
              <Trophy className="h-6 w-6 shrink-0" style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#6b7280" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1"
                  style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#6b7280" }}>
                  Resultado Final · {won ? "Vitória" : lost ? "Derrota" : "Empate"}
                </p>
                <div className="flex items-baseline gap-3">
                  <div className="text-center">
                    <p className="text-3xl font-black tabular-nums leading-none"
                      style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#374151" }}>
                      {session.home_score as number}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">CD Póvoa</p>
                  </div>
                  <span className="text-lg font-bold text-muted-foreground">–</span>
                  <div className="text-center">
                    <p className="text-3xl font-black tabular-nums leading-none"
                      style={{ color: won ? "#15803d" : lost ? "#dc2626" : "#374151" }}>
                      {session.away_score as number}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {(event.opponent as string | null) ?? "Adversário"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* A minha situação (se for jogador) */}
      {linkedPlayer?.id && (
        <div className="rounded-xl border bg-card px-4 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: myIsConvocado ? "var(--club-secondary, #F28C28)" : "var(--club-bg, #eeeeee)" }}
            >
              <Users
                className="h-4 w-4"
                style={{ color: myIsConvocado ? "#fff" : "var(--club-primary, #111111)" }}
              />
            </div>
            <p className="text-sm font-semibold">
              {myIsConvocado ? "Estás convocado" : "Não estás convocado"}
            </p>
          </div>
          {/* Disponibilidade — só mostramos botões para jogos futuros */}
          {!isPast && (
            <AvailabilityPrompt
              kind="game"
              eventId={id}
              deadlineIso={lisbonDateTime(event.event_date as string, event.event_time as string | null).toISOString()}
              initialAnswer={
                myAvailability === "available"   ? "yes" :
                myAvailability === "unavailable" ? "no"  : null
              }
            />
          )}
          {isPast && myAvailability && (
            <p className="text-xs text-muted-foreground">
              Disponibilidade registada:{" "}
              <span className={myAvailability === "available" ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
                {myAvailability === "available" ? "Disponível" : "Indisponível"}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Convocados — visível a todos */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            Convocados{callups.length > 0 ? ` (${callups.length})` : ""}
          </span>
        </div>
        <div className="px-4">
          {callups.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Ainda não há convocados definidos.</p>
          ) : (
            callups.map((p) => (
              <div key={p.player_id} className="flex items-center gap-3 py-2.5 border-b last:border-b-0">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    backgroundColor:
                      myPlayerIds.includes(p.player_id)
                        ? "var(--club-secondary, #F28C28)"
                        : "var(--club-primary, #111111)",
                  }}
                >
                  {initials(p.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">
                    {p.number ? <span className="text-muted-foreground mr-1">#{p.number}</span> : null}
                    {p.name}
                  </p>
                  {p.position && (
                    <p className="text-xs text-muted-foreground leading-tight">
                      {POSITION_LABELS[p.position] ?? p.position}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Disponibilidades — visível apenas a treinadores+ */}
      {isTrainerOrAbove && availRoster.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Disponibilidades
            </h2>
            <Link
              href={`/jogos/${id}/convocatoria`}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors"
            >
              <Users className="h-3.5 w-3.5" />
              Fazer convocatória
            </Link>
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card px-4 py-3 text-center">
              <p className="text-2xl font-bold text-green-600">{available.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Disponíveis</p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3 text-center">
              <p className="text-2xl font-bold text-red-500">{unavailable.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Indisponíveis</p>
            </div>
            <div className="rounded-xl border bg-card px-4 py-3 text-center">
              <p className="text-2xl font-bold text-muted-foreground">{pending.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sem resposta</p>
            </div>
          </div>

          {available.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-green-50 dark:bg-green-950/20">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Disponíveis ({available.length})
                </span>
              </div>
              <div className="px-4">
                {available.map((r) => <AvailRow key={r.player_id} row={r} />)}
              </div>
            </div>
          )}

          {unavailable.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-red-50 dark:bg-red-950/20">
                <X className="h-4 w-4 text-red-500" />
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  Indisponíveis ({unavailable.length})
                </span>
              </div>
              <div className="px-4">
                {unavailable.map((r) => <AvailRow key={r.player_id} row={r} />)}
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">
                  Sem resposta ({pending.length})
                </span>
              </div>
              <div className="px-4">
                {pending.map((r) => <AvailRow key={r.player_id} row={r} />)}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
