"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useGameSession } from "@/hooks/use-game-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target, Shield, Minus, Plus, RotateCcw, AlertTriangle,
  TrendingUp, ChevronRight, Flag, ArrowLeftRight, BarChart2,
} from "lucide-react";
import type { PlayEventType } from "@/types/database";
import type { PlayerWithUser } from "@/types/database";

// ── Configuração dos botões de ação ──────────────────────────
interface ActionBtn {
  label: string;
  event: PlayEventType;
  color: string;
  pts?: number;
}

const ACTION_GROUPS: { title: string; actions: ActionBtn[] }[] = [
  {
    title: "Pontos",
    actions: [
      { label: "2P ✓", event: "2pt_made",  color: "bg-green-600 hover:bg-green-700", pts: 2 },
      { label: "2P ✗", event: "2pt_miss",  color: "bg-green-900 hover:bg-green-800" },
      { label: "3P ✓", event: "3pt_made",  color: "bg-blue-600 hover:bg-blue-700",  pts: 3 },
      { label: "3P ✗", event: "3pt_miss",  color: "bg-blue-900 hover:bg-blue-800"  },
      { label: "LL ✓", event: "ft_made",   color: "bg-yellow-600 hover:bg-yellow-700", pts: 1 },
      { label: "LL ✗", event: "ft_miss",   color: "bg-yellow-900 hover:bg-yellow-800" },
    ],
  },
  {
    title: "Ressaltos & Assist.",
    actions: [
      { label: "Res. Of.", event: "rebound_off", color: "bg-purple-600 hover:bg-purple-700" },
      { label: "Res. Def.", event: "rebound_def", color: "bg-purple-800 hover:bg-purple-900" },
      { label: "Assist.",   event: "assist",      color: "bg-teal-600 hover:bg-teal-700"    },
    ],
  },
  {
    title: "Defesa",
    actions: [
      { label: "Roubo",   event: "steal",    color: "bg-orange-600 hover:bg-orange-700" },
      { label: "Desarme", event: "block",    color: "bg-orange-800 hover:bg-orange-900" },
      { label: "Turnover",event: "turnover", color: "bg-red-700 hover:bg-red-800"       },
    ],
  },
  {
    title: "Faltas",
    actions: [
      { label: "Falta Com.", event: "foul_committed", color: "bg-red-600 hover:bg-red-700"  },
      { label: "Falta Sof.", event: "foul_drawn",     color: "bg-red-400 hover:bg-red-500"  },
    ],
  },
];

const EVENT_LABELS: Partial<Record<PlayEventType, string>> = {
  "2pt_made": "2P convertido", "2pt_miss": "2P falhado",
  "3pt_made": "3P convertido", "3pt_miss": "3P falhado",
  "ft_made": "LL convertido", "ft_miss": "LL falhado",
  "rebound_off": "Ressalto Of.", "rebound_def": "Ressalto Def.",
  "assist": "Assistência", "steal": "Roubo", "block": "Desarme",
  "turnover": "Turnover", "foul_committed": "Falta Cometida", "foul_drawn": "Falta Sofrida",
  "game_start": "🏀 Início do Jogo", "period_end": "Fim de Período", "game_end": "🏁 Fim do Jogo",
};

// ── Componente principal ──────────────────────────────────────
export default function LiveGamePage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [seasonId, setSeasonId] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("seasons").select("id").eq("status", "ativa").single()
      .then(({ data }) => { if (data) setSeasonId(data.id); });
  }, []);

  const {
    session, plays, playerStats, roster, loading, recording,
    startGame, recordPlay, recordOpponentPoints, nextPeriod, finishGame,
  } = useGameSession(params.eventId, seasonId ?? "");

  // Estado local UI
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithUser | null>(null);
  const [pendingEvent, setPendingEvent] = useState<ActionBtn | null>(null);
  const [assistPlayer, setAssistPlayer] = useState<string | null>(null);

  // Dialogs
  const [startDialog, setStartDialog] = useState(false);
  const [opponentName, setOpponentName] = useState("");
  const [finishDialog, setFinishDialog] = useState(false);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [opponentPtsDialog, setOpponentPtsDialog] = useState(false);

  useEffect(() => {
    if (!loading && !session) setStartDialog(true);
  }, [loading, session]);

  // ── Confirmar evento ────────────────────────────────────────
  async function confirmEvent() {
    if (!pendingEvent || !selectedPlayer) return;
    const needsAssist = pendingEvent.event.endsWith("_made");

    await recordPlay({
      event_type: pendingEvent.event,
      player_id: selectedPlayer.user_id,
      secondary_player_id: needsAssist && assistPlayer ? assistPlayer : undefined,
    });

    setPendingEvent(null);
    setAssistPlayer(null);
  }

  if (loading || !seasonId) {
    return (
      <div className="min-h-screen bg-cdpovoa-blue p-4 space-y-4">
        <Skeleton className="h-20 w-full rounded-xl bg-white/10" />
        <Skeleton className="h-64 w-full rounded-xl bg-white/10" />
      </div>
    );
  }

  const isFinished = session?.status === "finished";

  return (
    <div className="min-h-screen bg-cdpovoa-blue text-white flex flex-col">
      {/* ── MARCADOR ─────────────────────────────────────── */}
      <header className="bg-cdpovoa-blue border-b border-white/10 px-4 py-3 flex items-center justify-between gap-2 sticky top-0 z-20">
        <div className="flex flex-col items-center flex-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/50">CD Póvoa</span>
          <span className="text-4xl font-black tabular-nums">{session?.home_score ?? 0}</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <Badge className={`text-[0.6rem] px-2 py-0.5 ${session?.status === "live" ? "bg-green-500" : "bg-white/20"}`}>
            {session?.status === "live" ? "● LIVE" : session?.status === "finished" ? "Terminado" : "Por iniciar"}
          </Badge>
          <span className="text-sm font-bold text-white/70">
            {session ? `${session.current_period}º P` : "—"}
          </span>
        </div>

        <div className="flex flex-col items-center flex-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/50 truncate max-w-[100px]">
            {session?.opponent_name ?? "Adversário"}
          </span>
          <span className="text-4xl font-black tabular-nums">{session?.away_score ?? 0}</span>
        </div>
      </header>

      {isFinished ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="text-5xl">🏁</span>
          <h2 className="text-2xl font-bold">Jogo Terminado</h2>
          <p className="text-white/60">CD Póvoa {session?.home_score} — {session?.away_score} {session?.opponent_name}</p>
          <Button className="bg-white text-cdpovoa-blue font-bold" onClick={() => router.push(`/jogos/${params.eventId}/stats`)}>
            <BarChart2 className="mr-2 h-4 w-4" /> Ver Estatísticas
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-auto">
          {/* ── SELEÇÃO DE JOGADOR ───────────────────────── */}
          <section className="px-3 pt-3 pb-1">
            <p className="text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">Selecionar jogador</p>
            <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
              {roster.map((p) => {
                const stats = playerStats.find((s) => s.player_id === p.user_id);
                const isSelected = selectedPlayer?.user_id === p.user_id;
                return (
                  <button
                    key={p.user_id}
                    onClick={() => setSelectedPlayer(isSelected ? null : p)}
                    className={`snap-start shrink-0 flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 min-w-[64px] border transition-all ${
                      isSelected
                        ? "bg-white text-cdpovoa-blue border-white font-bold"
                        : "bg-white/10 border-white/20 hover:bg-white/20"
                    }`}
                  >
                    <span className="text-lg font-black leading-none">{p.jersey_number ?? "–"}</span>
                    <span className="text-[0.6rem] leading-tight text-center max-w-[52px] truncate">
                      {p.user.name.split(" ")[0]}
                    </span>
                    {stats && (
                      <span className="text-[0.55rem] text-white/50">{stats.pts}pts</span>
                    )}
                    {stats && stats.fouls_committed >= 4 && (
                      <span className="text-[0.55rem] text-red-400 font-bold">{stats.fouls_committed}F</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── AÇÕES ────────────────────────────────────── */}
          <section className="px-3 pb-2 space-y-3">
            {ACTION_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">{group.title}</p>
                <div className="grid grid-cols-3 gap-2">
                  {group.actions.map((action) => (
                    <button
                      key={action.event}
                      disabled={!selectedPlayer || recording}
                      onClick={() => setPendingEvent(action)}
                      className={`${action.color} disabled:opacity-30 disabled:cursor-not-allowed rounded-xl py-3 px-2 text-sm font-bold text-white text-center transition-all active:scale-95`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* ── PONTOS ADVERSÁRIO ────────────────────────── */}
          <section className="px-3 pb-2">
            <p className="text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">Adversário</p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((pts) => (
                <button
                  key={pts}
                  onClick={() => recordOpponentPoints(pts)}
                  className="bg-white/10 hover:bg-white/20 rounded-xl py-3 text-sm font-bold text-white/80 transition-all active:scale-95"
                >
                  +{pts}
                </button>
              ))}
            </div>
          </section>

          {/* ── CONTROLOS DE JOGO ────────────────────────── */}
          <section className="px-3 pb-4">
            <p className="text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">Controlos</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="border-white/30 text-white bg-transparent hover:bg-white/10"
                onClick={() => setPeriodDialog(true)}
              >
                <ChevronRight className="mr-1.5 h-4 w-4" />
                Próximo Período
              </Button>
              <Button
                variant="outline"
                className="border-red-400 text-red-400 bg-transparent hover:bg-red-400/10"
                onClick={() => setFinishDialog(true)}
              >
                <Flag className="mr-1.5 h-4 w-4" />
                Terminar Jogo
              </Button>
            </div>
          </section>

          {/* ── PLAY-BY-PLAY MINI ────────────────────────── */}
          {plays.length > 0 && (
            <section className="px-3 pb-4">
              <p className="text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">Últimos eventos</p>
              <div className="space-y-1">
                {plays.slice(0, 8).map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs text-white/60 py-0.5">
                    <span className="shrink-0 text-white/30">{p.period}P</span>
                    <span className="flex-1 truncate">{EVENT_LABELS[p.event_type] ?? p.event_type}</span>
                    {p.points_delta > 0 && (
                      <span className={`font-bold ${p.is_home_team ? "text-green-400" : "text-red-400"}`}>
                        +{p.points_delta}
                      </span>
                    )}
                    <span className="text-white/30 tabular-nums">{p.home_score_after}–{p.away_score_after}</span>
                  </div>
                ))}
                <button
                  onClick={() => router.push(`/jogos/${params.eventId}/stats`)}
                  className="text-xs text-white/40 underline"
                >
                  Ver estatísticas completas →
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── DIALOG: confirmar evento ────────────────────── */}
      <Dialog open={!!pendingEvent} onOpenChange={() => { setPendingEvent(null); setAssistPlayer(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingEvent?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Jogador: <strong>{selectedPlayer?.user.name}</strong>
            </p>
            {pendingEvent?.event.endsWith("_made") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Assistência (opcional)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {roster
                    .filter((p) => p.user_id !== selectedPlayer?.user_id)
                    .map((p) => (
                      <button
                        key={p.user_id}
                        onClick={() => setAssistPlayer(p.user_id === assistPlayer ? null : p.user_id)}
                        className={`text-xs rounded-md px-2 py-1 border transition-all ${
                          assistPlayer === p.user_id
                            ? "bg-cdpovoa-blue text-white border-cdpovoa-blue"
                            : "border-border hover:border-cdpovoa-blue"
                        }`}
                      >
                        {p.jersey_number} {p.user.name.split(" ")[0]}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingEvent(null); setAssistPlayer(null); }}>
              Cancelar
            </Button>
            <Button onClick={confirmEvent} disabled={recording}>
              {recording ? "A registar…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: iniciar jogo ─────────────────────────── */}
      <Dialog open={startDialog} onOpenChange={setStartDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Iniciar Jogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="opponent">Nome do adversário</Label>
            <Input
              id="opponent"
              placeholder="Lions BC"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={async () => {
              const ok = await startGame(opponentName || "Adversário");
              if (ok) setStartDialog(false);
            }} disabled={recording}>
              🏀 Iniciar Jogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: confirmar próximo período ────────────── */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Próximo Período</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Terminar o {session?.current_period}º período e avançar para o {(session?.current_period ?? 0) + 1}º?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialog(false)}>Cancelar</Button>
            <Button onClick={async () => { await nextPeriod(); setPeriodDialog(false); }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: terminar jogo ────────────────────────── */}
      <Dialog open={finishDialog} onOpenChange={setFinishDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Terminar Jogo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            CD Póvoa <strong>{session?.home_score}</strong> vs <strong>{session?.away_score}</strong> {session?.opponent_name}
            <br />Confirmas o resultado final?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              const ok = await finishGame();
              if (ok) setFinishDialog(false);
            }}>
              🏁 Terminar Jogo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
