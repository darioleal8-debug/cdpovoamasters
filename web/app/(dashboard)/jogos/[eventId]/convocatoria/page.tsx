"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameCallups } from "@/hooks/use-game-callups";
import { useRoster } from "@/hooks/use-roster";
import { toast } from "@/components/ui/toaster";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle2, Brain, X } from "lucide-react";
import { formatDateShort } from "@/lib/utils";
import type { Event } from "@/types/database";

// ─── Types ────────────────────────────────────────────────

type Filter = "todos" | "treinaram" | "topaia" | "fora";
type Origin = "vazio" | "manual" | "ultimo-treino" | "ultimos-30" | "avaliacao-ia";

interface DSPlayer { player_id: string; name: string; score?: number; reason: string; }
interface DSResult {
  evaluation: { recommended_players: DSPlayer[]; excluded_players: DSPlayer[]; tactical_notes?: string; };
  opponent: string;
  games_with_opponent: number;
}

// ─── Helpers ──────────────────────────────────────────────

function scoreColor(n: number) {
  if (n >= 85) return "#4ade80";
  if (n >= 72) return "#fbbf24";
  return "#f87171";
}

const ORIGIN_TEXT: Record<Origin, string> = {
  vazio:         "vazio",
  manual:        "seleção manual",
  "ultimo-treino": "preenchido por: último treino",
  "ultimos-30":    "preenchido por: presenças 30 dias",
  "avaliacao-ia":  "preenchido por: avaliação IA",
};

const FILTER_LABELS: Record<Filter, string> = {
  todos:    "Todos",
  treinaram: "Treinaram",
  topaia:   "Top 8 IA",
  fora:     "Fora",
};

// ─── Page ─────────────────────────────────────────────────

export default function ConvocatoriaPage() {
  const params  = useParams<{ eventId: string }>();
  const router  = useRouter();
  const supabase = createClient();

  const [event, setEvent]               = useState<Event | null>(null);
  const [eventLoading, setEventLoading] = useState(true);

  // attendance / payment data (keyed by players.id)
  const [latePlayerIds,   setLatePlayerIds]   = useState<Set<string>>(new Set());
  const [lastTrainingIds, setLastTrainingIds] = useState<Set<string>>(new Set());
  const [presences30,     setPresences30]     = useState<Map<string, number>>(new Map());
  const [aiScores,        setAiScores]        = useState<Map<string, number>>(new Map());

  const [filter,       setFilter]      = useState<Filter>("todos");
  const [origin,       setOrigin]      = useState<Origin>("vazio");
  const [selectedPid,  setSelectedPid] = useState<string | null>(null);
  const [draggingPid,  setDraggingPid] = useState<string | null>(null);

  const [autoLoading,      setAutoLoading]      = useState(false);
  const [deepseekLoading,  setDeepseekLoading]  = useState(false);
  const [dsResult,         setDsResult]         = useState<DSResult | null>(null);
  const [showDsModal,      setShowDsModal]      = useState(false);

  const { callups, loading: callupsLoading, addCallup, removeCallup } =
    useGameCallups(params.eventId);
  const { players, loading: rosterLoading } =
    useRoster(event?.season_id ?? null);

  // ── Fetch event ──────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("events").select("*").eq("id", params.eventId).single()
      .then(({ data }) => { setEvent(data as Event); setEventLoading(false); });
  }, [params.eventId]);

  // ── Fetch late payments ──────────────────────────────────
  useEffect(() => {
    if (!event?.season_id) return;
    supabase
      .from("player_payment_summary")
      .select("player_id, months_late")
      .eq("season_id", event.season_id)
      .then(({ data }) => {
        if (!data) return;
        setLatePlayerIds(
          new Set(
            (data as { player_id: string; months_late: number }[])
              .filter((s) => (s.months_late ?? 0) > 0)
              .map((s) => s.player_id)
          )
        );
      });
  }, [event?.season_id]);

  // ── Fetch attendance data for card badges ────────────────
  useEffect(() => {
    if (!event?.season_id) return;

    // Last training
    supabase
      .from("trainings").select("id")
      .eq("season_id", event.season_id)
      .order("date", { ascending: false }).limit(1)
      .then(({ data: ts }) => {
        if (!ts?.length) return;
        supabase
          .from("training_attendance").select("player_id")
          .eq("training_id", (ts[0] as { id: string }).id)
          .in("status", ["present", "late"])
          .then(({ data: att }) => {
            if (att) setLastTrainingIds(new Set((att as { player_id: string }[]).map((a) => a.player_id)));
          });
      });

    // Last 30 days presences
    const since = new Date();
    since.setDate(since.getDate() - 30);
    supabase
      .from("trainings").select("id")
      .eq("season_id", event.season_id)
      .gte("date", since.toISOString().split("T")[0])
      .then(({ data: ts }) => {
        if (!ts?.length) return;
        supabase
          .from("training_attendance").select("player_id")
          .in("training_id", (ts as { id: string }[]).map((t) => t.id))
          .in("status", ["present", "late"])
          .then(({ data: att }) => {
            if (!att) return;
            const m = new Map<string, number>();
            for (const a of att as { player_id: string }[])
              m.set(a.player_id, (m.get(a.player_id) ?? 0) + 1);
            setPresences30(m);
          });
      });
  }, [event?.season_id]);

  // ── Derived data ─────────────────────────────────────────
  // game_callups.player_id === players.id === RosterEntry.player_id
  const calledUpIds = new Set(callups.map((c) => c.player_id));
  const slots = Array.from({ length: 12 }, (_, i) => callups[i] ?? null);

  // Only players with a profile this season and a jersey number
  const eligible = players.filter((p) => p.player_id !== null && p.number !== null);

  // Sorted by AI score descending
  const sorted = [...eligible].sort(
    (a, b) => (aiScores.get(b.player_id!) ?? 0) - (aiScores.get(a.player_id!) ?? 0)
  );

  function visiblePlayers() {
    switch (filter) {
      case "treinaram": return sorted.filter((p) => lastTrainingIds.has(p.player_id!));
      case "topaia":    return sorted.filter((p) => aiScores.has(p.player_id!)).slice(0, 8);
      case "fora":      return sorted.filter((p) => !calledUpIds.has(p.player_id!));
      default:          return sorted;
    }
  }

  // ── Assign (add to callup) ────────────────────────────────
  async function assign(pid: string) {
    if (latePlayerIds.has(pid)) {
      toast({ title: "Quotas em atraso", description: "Regulariza as quotas para convocar este jogador.", variant: "destructive" });
      return;
    }
    if (calledUpIds.has(pid)) return;
    if (callups.length >= 12) {
      toast({ title: "Máximo de 12 convocados atingido", variant: "destructive" });
      return;
    }
    if (await addCallup(pid)) {
      setOrigin("manual");
      setSelectedPid(null);
    }
  }

  // ── Drag & drop ───────────────────────────────────────────
  function onDragStart(e: React.DragEvent, pid: string) {
    setDraggingPid(pid);
    e.dataTransfer.setData("text/plain", pid);
    e.dataTransfer.effectAllowed = "copy";
  }
  function onDragEnd() { setDraggingPid(null); }
  function onRailDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  async function onRailDrop(e: React.DragEvent) {
    e.preventDefault();
    const pid = e.dataTransfer.getData("text/plain") || draggingPid;
    setDraggingPid(null);
    if (pid) await assign(pid);
  }

  // ── AUTO: último treino (presentes ordenados por IA) ─────
  async function autoLastTraining() {
    if (!event?.season_id || autoLoading) return;
    setAutoLoading(true);
    try {
      const { data: ts } = await supabase
        .from("trainings").select("id, date")
        .eq("season_id", event.season_id)
        .order("date", { ascending: false }).limit(1);
      if (!ts?.length) { toast({ title: "Nenhum treino encontrado", variant: "destructive" }); return; }

      const { data: att } = await supabase
        .from("training_attendance").select("player_id")
        .eq("training_id", ts[0].id)
        .in("status", ["present", "late"]);
      if (!att?.length) { toast({ title: "Nenhuma presença no último treino", variant: "destructive" }); return; }

      const presentSet = new Set((att as { player_id: string }[]).map((a) => a.player_id));
      const toAdd = sorted
        .filter((p) => presentSet.has(p.player_id!) && !calledUpIds.has(p.player_id!) && !latePlayerIds.has(p.player_id!))
        .slice(0, 12 - callups.length)
        .map((p) => p.player_id!);

      if (!toAdd.length) { toast({ title: "Nenhum disponível para convocar" }); return; }
      let added = 0;
      for (const pid of toAdd) { if (await addCallup(pid)) added++; }
      if (added > 0) setOrigin("ultimo-treino");
      toast({ title: `${added} jogador(es) convocado(s)`, description: `Último treino · ${ts[0].date}` });
    } finally { setAutoLoading(false); }
  }

  // ── AUTO: últimos 30 dias (top por presenças) ─────────────
  async function auto30Days() {
    if (!event?.season_id || autoLoading) return;
    setAutoLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data: ts } = await supabase
        .from("trainings").select("id")
        .eq("season_id", event.season_id)
        .gte("date", since.toISOString().split("T")[0]);
      if (!ts?.length) { toast({ title: "Nenhum treino nos últimos 30 dias", variant: "destructive" }); return; }

      const { data: att } = await supabase
        .from("training_attendance").select("player_id")
        .in("training_id", (ts as { id: string }[]).map((t) => t.id))
        .in("status", ["present", "late"]);
      if (!att?.length) { toast({ title: "Nenhuma presença nos últimos 30 dias", variant: "destructive" }); return; }

      const counts: Record<string, number> = {};
      for (const a of att as { player_id: string }[])
        counts[a.player_id] = (counts[a.player_id] ?? 0) + 1;

      const toAdd = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([pid]) => pid)
        .filter((pid) => !calledUpIds.has(pid) && !latePlayerIds.has(pid))
        .slice(0, 12 - callups.length);

      if (!toAdd.length) { toast({ title: "Nenhum disponível para convocar" }); return; }
      let added = 0;
      for (const pid of toAdd) { if (await addCallup(pid)) added++; }
      if (added > 0) setOrigin("ultimos-30");
      toast({ title: `${added} jogador(es) convocado(s)`, description: "Por assiduidade nos últimos 30 dias" });
    } finally { setAutoLoading(false); }
  }

  // ── AUTO / Modal: Avaliação IA ────────────────────────────
  async function openDeepSeek() {
    if (!event?.id || deepseekLoading) return;
    setDeepseekLoading(true);
    try {
      const res  = await fetch("/api/deepseek/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ event_id: event.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Erro na avaliação", description: data.error ?? "Tenta novamente", variant: "destructive" }); return; }

      const result = data as DSResult;
      setDsResult(result);

      const scores = new Map<string, number>();
      for (const p of result.evaluation.recommended_players ?? []) { if (p.score !== undefined) scores.set(p.player_id, p.score); }
      for (const p of result.evaluation.excluded_players     ?? []) { if (p.score !== undefined) scores.set(p.player_id, p.score); }
      setAiScores(scores);
      setShowDsModal(true);
    } catch {
      toast({ title: "Erro de ligação", description: "Não foi possível contactar o servidor", variant: "destructive" });
    } finally { setDeepseekLoading(false); }
  }

  async function applyDsRecommendation() {
    if (!dsResult) return;
    const toAdd = dsResult.evaluation.recommended_players
      .map((p) => p.player_id)
      .filter((pid) => !calledUpIds.has(pid) && !latePlayerIds.has(pid))
      .slice(0, 12 - callups.length);
    let added = 0;
    for (const pid of toAdd) { if (await addCallup(pid)) added++; }
    if (added > 0) setOrigin("avaliacao-ia");
    setShowDsModal(false);
    toast({ title: `${added} jogador(es) adicionado(s)`, description: "Recomendação IA aplicada" });
  }

  const isLoading = eventLoading || callupsLoading || rosterLoading;

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "100dvh", background: "#0a1020", color: "#eef3fb" }}
    >

      {/* ════ HEADER ════════════════════════════════════════ */}
      <header
        className="shrink-0 flex items-center gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid #1a2540" }}
      >
        {/* Back */}
        <button
          onClick={() => router.push("/jogos")}
          className="shrink-0 rounded p-1 transition-colors"
          style={{ color: "rgba(238,243,251,0.45)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#eef3fb")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(238,243,251,0.45)")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {eventLoading ? (
            <Skeleton className="h-4 w-52" style={{ background: "#1a2540" }} />
          ) : (
            <>
              <h1 className="text-sm font-bold leading-tight truncate" style={{ color: "#eef3fb" }}>
                {event?.title ?? "Convocatória"}
              </h1>
              <p className="text-[0.64rem]" style={{ color: "#6f7d99" }}>
                {event ? `${formatDateShort(event.event_date)} · ${event.event_time.slice(0, 5)}h` : ""}
                {event?.opponent   ? ` · vs. ${event.opponent}`   : ""}
                {event?.competition ? ` · ${event.competition}` : ""}
              </p>
            </>
          )}
        </div>

        {/* AUTO block */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={autoLastTraining}
            disabled={autoLoading || isLoading || callups.length >= 12}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap"
            style={{ background: "#15803d", color: "#fff" }}
          >
            Último treino
          </button>
          <button
            onClick={auto30Days}
            disabled={autoLoading || isLoading || callups.length >= 12}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap"
            style={{ background: "#7c3aed", color: "#fff" }}
          >
            Últimos 30 dias
          </button>
          <button
            onClick={openDeepSeek}
            disabled={deepseekLoading || isLoading || !event?.id}
            className="flex items-center gap-1 text-xs font-semibold rounded-lg px-3 py-1.5 transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap"
            style={{ background: "#c2410c", color: "#fff" }}
          >
            <Brain className="h-3.5 w-3.5 shrink-0" />
            {deepseekLoading ? "A analisar…" : "Avaliação IA"}
          </button>
        </div>

        {/* N/12 pill */}
        <div
          className="shrink-0 flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-full"
          style={{
            background: callups.length >= 12 ? "rgba(74,222,128,0.12)" : "#182238",
            color:      callups.length >= 12 ? "#4ade80" : "#eef3fb",
          }}
        >
          {callups.length}/12
          {callups.length >= 12 && <CheckCircle2 className="h-3.5 w-3.5" />}
        </div>
      </header>

      {/* ════ CALLUP RAIL (HORIZONTAL) ══════════════════════ */}
      <div
        className="shrink-0 px-5 pt-3 pb-3"
        style={{ borderBottom: "1px solid #1a2540" }}
        onDragOver={onRailDragOver}
        onDrop={onRailDrop}
      >
        {/* CONVOCADOS label + origin */}
        <div className="flex items-baseline gap-2 mb-2">
          <span
            className="text-[0.6rem] font-semibold uppercase tracking-widest"
            style={{ color: "#6f7d99" }}
          >
            Convocados
          </span>
          <span className="text-[0.58rem]" style={{ color: "#33405e" }}>
            {ORIGIN_TEXT[origin]}
          </span>
        </div>

        {/* 12 slots — REGRA 1: horizontal grid, repeat(12,1fr), gap 8px, 58px height */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: 8,
          }}
        >
          {slots.map((callup, i) => (
            <div
              key={i}
              onClick={() => callup && removeCallup(callup.id)}
              style={{
                height: 58,
                borderRadius: 9,
                border: callup ? "1.5px solid #2f4670" : "1.5px dashed #26314a",
                background: callup ? "#1b2b46" : "#141c2e",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: callup ? "pointer" : "default",
                overflow: "hidden",
                padding: "3px 4px",
                gap: 2,
                transition: "border-color 0.15s",
              }}
            >
              {callup ? (
                <>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                    {callup.player.number ?? "?"}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#a8b6d1",
                      lineHeight: 1,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "center",
                    }}
                  >
                    {callup.player.name.split(" ")[0]}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#33405e" }}>{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ════ FILTER CHIPS ══════════════════════════════════ */}
      {/* REGRA 4: Todos/Treinaram/Top 8 IA/Fora; active=#f97316 text=#0a1020 */}
      <div
        className="shrink-0 flex items-center gap-2 px-5 py-2"
        style={{ borderBottom: "1px solid #1a2540" }}
      >
        {(["todos", "treinaram", "topaia", "fora"] as Filter[]).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "4px 14px",
                borderRadius: 999,
                border: active ? "none" : "1px solid #28344f",
                background: active ? "#f97316" : "#182238",
                color:      active ? "#0a1020" : "#9fadc7",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          );
        })}
      </div>

      {/* ════ PLAYER GRID ════════════════════════════════════ */}
      {/* REGRA 3: repeat(5,1fr), gap 12px, sorted by IA score desc */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" style={{ background: "#161f33" }} />
            ))}
          </div>
        ) : visiblePlayers().length === 0 ? (
          <div className="flex items-center justify-center h-28">
            <p style={{ color: "#33405e" }} className="text-sm">Sem jogadores</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
            {visiblePlayers().map((p) => {
              const pid           = p.player_id!;
              const isCalledUp    = calledUpIds.has(pid);
              const isLate        = latePlayerIds.has(pid);
              const isSelected    = selectedPid === pid;
              const score         = aiScores.get(pid);
              const sc            = score !== undefined ? scoreColor(score) : undefined;
              const inLastTraining = lastTrainingIds.has(pid);
              const pCount        = presences30.get(pid) ?? 0;

              return (
                /* REGRA 3: padding 14px, radius 12px, bg #161f33, border #232e49 */
                /* REGRA 3 selected: border 1.5px #f97316, bg #1b2b46 */
                <div
                  key={pid}
                  draggable={!isCalledUp && !isLate}
                  onDragStart={(e) => !isCalledUp && !isLate && onDragStart(e, pid)}
                  onDragEnd={onDragEnd}
                  onClick={() => {
                    if (isLate) {
                      toast({ title: "Quotas em atraso", description: "Regulariza para convocar.", variant: "destructive" });
                      return;
                    }
                    if (isCalledUp) return;
                    setSelectedPid((prev) => (prev === pid ? null : pid));
                    assign(pid);
                  }}
                  style={{
                    padding: 14,
                    paddingBottom: 18,
                    borderRadius: 12,
                    border: isSelected
                      ? "1.5px solid #f97316"
                      : "1.5px solid #232e49",
                    background: isSelected ? "#1b2b46" : "#161f33",
                    opacity:    isCalledUp ? 0.35 : isLate ? 0.65 : 1,
                    cursor:     isCalledUp ? "default" : isLate ? "not-allowed" : "grab",
                    position:   "relative",
                    overflow:   "hidden",
                    display:    "flex",
                    flexDirection: "column",
                    gap: 6,
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  {/* ── ELEMENT 1: top row — dorsal (left) + badge IA (right) ── */}
                  {/* REGRA 2: space-between, dorsal 40px #1d4ed8 r10 nº16px bold; badge #111a2b r6 11px bold */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 40, height: 40,
                        borderRadius: 10,
                        background: isLate ? "#7f1d1d" : "#1d4ed8",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                        {p.number}
                      </span>
                    </div>
                    {score !== undefined && (
                      <div
                        style={{
                          background: "#111a2b",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 700,
                          color: sc,
                          lineHeight: 1.6,
                          flexShrink: 0,
                        }}
                      >
                        {score}
                      </div>
                    )}
                  </div>

                  {/* ── ELEMENT 2: nome 14px bold #eef3fb ── */}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#eef3fb",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.name}
                  </div>

                  {/* ── ELEMENT 3: posição 10.5px maiúsculas #6f7d99 ── */}
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "#6f7d99",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      lineHeight: 1,
                    }}
                  >
                    {p.position ?? "—"}
                  </div>

                  {/* ── ELEMENT 4: tags flex-wrap ── */}
                  {/* REGRA 2: último treino condicional; N presenças sempre */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {inLastTraining && (
                      <span
                        style={{
                          fontSize: "0.58rem",
                          fontWeight: 600,
                          color: "#86efac",
                          background: "#14331f",
                          border: "1px solid #1d5732",
                          borderRadius: 4,
                          padding: "1px 6px",
                          lineHeight: 1.6,
                        }}
                      >
                        último treino
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: "0.58rem",
                        fontWeight: 600,
                        color: "#c4b5fd",
                        background: "#241a3f",
                        border: "1px solid #3b2a63",
                        borderRadius: 4,
                        padding: "1px 6px",
                        lineHeight: 1.6,
                      }}
                    >
                      {pCount} pres.
                    </span>
                    {isLate && (
                      <span
                        style={{
                          fontSize: "0.58rem",
                          fontWeight: 700,
                          color: "#fca5a5",
                          background: "#450a0a",
                          border: "1px solid #7f1d1d",
                          borderRadius: 4,
                          padding: "1px 6px",
                          lineHeight: 1.6,
                        }}
                      >
                        BLOQ.
                      </span>
                    )}
                  </div>

                  {/* ── ELEMENT 5: barra 4px no fundo — REGRA 2 ── */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0, left: 0, right: 0,
                      height: 4,
                      background: "#1e2840",
                    }}
                  >
                    {score !== undefined && (
                      <div
                        style={{
                          height: "100%",
                          width: `${score}%`,
                          background: sc,
                          transition: "width 0.35s ease",
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ════ DEEPSEEK MODAL ════════════════════════════════ */}
      {showDsModal && dsResult && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDsModal(false); }}
        >
          <div
            className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
            style={{ background: "#0f1929", border: "1px solid #1e2e4a" }}
          >
            {/* Modal header */}
            <div
              className="shrink-0 flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: "1px solid #1e2e4a" }}
            >
              <Brain className="h-5 w-5 shrink-0" style={{ color: "#fb923c" }} />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold" style={{ color: "#eef3fb" }}>Avaliação IA — DeepSeek</h2>
                <p className="text-[0.6rem]" style={{ color: "#6f7d99" }}>
                  vs. {dsResult.opponent}
                  {dsResult.games_with_opponent > 0
                    ? ` · ${dsResult.games_with_opponent} jogo(s) de histórico`
                    : " · sem histórico"}
                </p>
              </div>
              <button
                onClick={() => setShowDsModal(false)}
                className="rounded-lg p-1 transition-colors"
                style={{ color: "rgba(238,243,251,0.4)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {(dsResult.evaluation.recommended_players?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <p
                    className="text-[0.62rem] uppercase tracking-widest font-semibold"
                    style={{ color: "#fb923c" }}
                  >
                    Recomendados
                  </p>
                  {dsResult.evaluation.recommended_players.map((p, i) => {
                    const score   = p.score ?? 0;
                    const already = calledUpIds.has(p.player_id);
                    return (
                      <div
                        key={p.player_id}
                        className="flex items-start gap-3 rounded-xl px-3 py-2"
                        style={{
                          border:     already ? "1px solid rgba(74,222,128,0.25)" : "1px solid #1e2e4a",
                          background: already ? "rgba(74,222,128,0.05)" : "#141c2e",
                          opacity:    already ? 0.7 : 1,
                        }}
                      >
                        <span
                          className="shrink-0 text-[0.58rem] font-bold w-4 text-right mt-0.5"
                          style={{ color: "#33405e" }}
                        >{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold truncate" style={{ color: "#eef3fb" }}>{p.name}</span>
                            {already && (
                              <span className="text-[0.5rem] shrink-0" style={{ color: "#4ade80" }}>✓ convocado</span>
                            )}
                          </div>
                          <p className="text-[0.6rem] mt-0.5 leading-snug" style={{ color: "#6f7d99" }}>{p.reason}</p>
                        </div>
                        <span
                          className="shrink-0 text-[0.58rem] font-bold rounded-full px-1.5 py-0.5"
                          style={{ background: "#111a2b", color: scoreColor(score) }}
                        >
                          {score}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {(dsResult.evaluation.excluded_players?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <p
                    className="text-[0.62rem] uppercase tracking-widest font-semibold"
                    style={{ color: "#f87171" }}
                  >
                    Excluídos
                  </p>
                  {dsResult.evaluation.excluded_players.map((p) => (
                    <div
                      key={p.player_id}
                      className="flex items-start gap-2 rounded-xl px-3 py-2"
                      style={{ border: "1px solid #3a1a1a", background: "#1a0f0f" }}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold block truncate" style={{ color: "rgba(238,243,251,0.5)" }}>{p.name}</span>
                        <p className="text-[0.6rem] mt-0.5 leading-snug" style={{ color: "rgba(248,113,113,0.7)" }}>{p.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {dsResult.evaluation.tactical_notes && (
                <div className="space-y-1.5">
                  <p
                    className="text-[0.62rem] uppercase tracking-widest font-semibold"
                    style={{ color: "#6f7d99" }}
                  >
                    Notas Táticas
                  </p>
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{ background: "#141c2e", border: "1px solid #1e2e4a" }}
                  >
                    <p className="text-[0.65rem] leading-relaxed" style={{ color: "rgba(238,243,251,0.6)" }}>
                      {dsResult.evaluation.tactical_notes}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              className="shrink-0 flex items-center gap-2 px-4 py-3"
              style={{ borderTop: "1px solid #1e2e4a", background: "#0a1020" }}
            >
              <button
                onClick={applyDsRecommendation}
                disabled={!dsResult.evaluation.recommended_players?.length}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-semibold rounded-xl px-4 py-2.5 transition-all active:scale-95 disabled:opacity-40"
                style={{ background: "#c2410c", color: "#fff" }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Aplicar Convocatória Recomendada
              </button>
              <button
                onClick={() => setShowDsModal(false)}
                className="text-xs font-semibold rounded-xl px-4 py-2.5 transition-all"
                style={{ border: "1px solid #28344f", color: "#6f7d99" }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
