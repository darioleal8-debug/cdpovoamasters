"use client";

import { useState, useEffect } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { useGames } from "@/hooks/use-games";
import { useLeagueCalendar } from "@/hooks/use-league-calendar";
import { useTeamKits } from "@/hooks/use-team-kits";
import { GamesTable } from "@/components/games/games-table";
import type { GameSessionSummary } from "@/components/games/games-table";
import { CallupsModal } from "@/components/games/callups-modal";
import { LeagueCalendar } from "@/components/games/league-calendar";
import { LeagueAgenda } from "@/components/games/league-agenda";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { createClient } from "@/lib/supabase/client";
import { Trophy, CalendarDays } from "lucide-react";
import type { Event } from "@/types/database";

export default function JogosPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { events, loading: eventsLoading, createGame, createTraining, updateEvent, deleteEvent } = useGames(seasonId);

  const {
    jornadas, allJornadas, jornadaMeta, rawGames, stats, loading: ligaLoading,
    selectedJornada, setSelectedJornada,
  } = useLeagueCalendar(seasonId);

  const { kitsByTeam } = useTeamKits();

  // ── Separador activo com persistência no URL ─────────────
  const [activeTab, setActiveTab] = useState("calendario");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "calendario" || tab === "agenda") setActiveTab(tab);
  }, []);

  // ── Detecção de papel (jogador vs treinador/admin) ───────
  const [isPlayer, setIsPlayer] = useState(false);

  useEffect(() => {
    if (!seasonId) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("players")
        .select("id")
        .eq("user_id", user.id)
        .eq("season_id", seasonId)
        .maybeSingle();
      const isP = !!data;
      setIsPlayer(isP);
      // Jogadores vêem a Agenda por omissão (se a URL não especificar outro separador)
      if (isP) {
        const params = new URLSearchParams(window.location.search);
        if (!params.get("tab")) setActiveTab("agenda");
      }
    });
  }, [seasonId]);

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  }

  // ── Callups / delete ─────────────────────────────────────
  const [callupsGame, setCallupsGame] = useState<Event | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Event | null>(null);

  // Game sessions for past games (to show scores + gate "Resultado" button)
  const [gameSessions, setGameSessions] = useState<Record<string, GameSessionSummary>>({});

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pastGameIds = events
      .filter((e) => e.type === "jogo" && e.event_date < today)
      .map((e) => e.id);
    if (!pastGameIds.length) { setGameSessions({}); return; }

    const supabase = createClient();
    supabase
      .from("game_sessions")
      .select("event_id, home_score, away_score, status")
      .in("event_id", pastGameIds)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, GameSessionSummary> = {};
        for (const s of data) map[s.event_id as string] = {
          home_score: s.home_score as number,
          away_score: s.away_score as number,
          status:     s.status as string,
        };
        setGameSessions(map);
      });
  }, [events]);

  // ── Resultado modal ──────────────────────────────────────
  const [resultGame,   setResultGame]   = useState<Event | null>(null);
  const [resultHome,   setResultHome]   = useState(0);
  const [resultAway,   setResultAway]   = useState(0);
  const [resultSaving, setResultSaving] = useState(false);

  function openResult(event: Event) {
    const existing = gameSessions[event.id];
    setResultHome(existing?.home_score ?? 0);
    setResultAway(existing?.away_score ?? 0);
    setResultGame(event);
  }

  async function submitResult() {
    if (!resultGame) return;
    setResultSaving(true);
    try {
      const res = await fetch(`/api/games/${resultGame.id}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home_score: resultHome, away_score: resultAway }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
      setGameSessions((prev) => ({
        ...prev,
        [resultGame.id]: { home_score: resultHome, away_score: resultAway, status: "finished" },
      }));
      toast({ title: "Resultado registado com sucesso" });
      setResultGame(null);
    } catch (e) {
      toast({ title: "Erro ao guardar resultado", description: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setResultSaving(false);
    }
  }

  // ── Diálogo novo/editar evento ───────────────────────────
  const [dialogOpen, setDialogOpen]       = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventType, setEventType]         = useState<"jogo" | "treino">("jogo");
  const [gameType, setGameType]           = useState<"official" | "friendly">("official");
  const [formData, setFormData]           = useState({
    title: "", location: "", event_date: "", event_time: "",
    opponent: "", training_kind: "", description: "",
  });

  function openAdd() {
    setEditingEventId(null);
    setFormData({ title: "", location: "", event_date: "", event_time: "",
                  opponent: "", training_kind: "", description: "" });
    setEventType("jogo");
    setGameType("official");
    setDialogOpen(true);
  }

  function openEdit(event: Event) {
    setEditingEventId(event.id);
    setEventType(event.type as "jogo" | "treino");
    setGameType((event.game_type as "official" | "friendly") ?? "official");
    setFormData({
      title:         event.title ?? "",
      location:      event.location ?? "",
      event_date:    event.event_date ?? "",
      event_time:    (event.event_time ?? "").slice(0, 5),
      opponent:      event.opponent ?? "",
      training_kind: (event as unknown as { training_kind?: string }).training_kind ?? "",
      description:   event.description ?? "",
    });
    setDialogOpen(true);
  }

  function handleDelete(event: Event) {
    setPendingDelete(event);
  }

  async function confirmDeleteEvent() {
    if (!pendingDelete) return;
    await deleteEvent(pendingDelete.id);
    setPendingDelete(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!seasonId) return;
    const base = {
      season_id: seasonId,
      title: formData.title,
      location: formData.location,
      event_date: formData.event_date,
      event_time: formData.event_time + ":00",
      description: formData.description || undefined,
    };
    if (editingEventId) {
      const ok = await updateEvent(editingEventId, {
        title:         base.title,
        location:      base.location,
        event_date:    base.event_date,
        event_time:    base.event_time,
        description:   formData.description || null,
        ...(eventType === "jogo"
          ? { opponent: formData.opponent || null, game_type: gameType }
          : { training_kind: formData.training_kind || null }),
      });
      if (ok) { setDialogOpen(false); setEditingEventId(null); }
    } else {
      const ok = eventType === "jogo"
        ? await createGame({ ...base, opponent: formData.opponent || undefined, game_type: gameType })
        : await createTraining({ ...base, training_kind: formData.training_kind || undefined });
      if (ok) setDialogOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jogos</h1>
          <p className="text-muted-foreground">Calendário da Liga e agenda de eventos</p>
        </div>
        <Select value={seasonId ?? ""} onValueChange={setSelectedSeasonId} disabled={seasonsLoading}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Selecionar temporada" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.status === "ativa" ? "✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="calendario" className="gap-2">
            <Trophy className="h-4 w-4" />Calendário Liga
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2">
            <CalendarDays className="h-4 w-4" />Agenda
          </TabsTrigger>
        </TabsList>

        {/* ── Calendário completo da liga ── */}
        <TabsContent value="calendario">
          <LeagueCalendar
            jornadas={jornadas}
            allJornadas={allJornadas}
            jornadaMeta={jornadaMeta}
            stats={stats}
            loading={ligaLoading}
            selectedJornada={selectedJornada}
            onSelectJornada={setSelectedJornada}
            kitsByTeam={kitsByTeam}
          />
        </TabsContent>

        {/* ── Agenda: vista de jogador vs treinador/admin ── */}
        <TabsContent value="agenda" className="space-y-4">
          {isPlayer ? (
            <LeagueAgenda
              allJornadas={allJornadas}
              jornadaMeta={jornadaMeta}
              rawGames={rawGames}
              events={events}
              loading={ligaLoading || eventsLoading}
            />
          ) : (
            <>
              <GamesTable
                events={events}
                loading={eventsLoading}
                onAdd={openAdd}
                onEdit={openEdit}
                onDelete={handleDelete}
                onCallups={setCallupsGame}
                gameSessions={gameSessions}
                onResult={openResult}
              />

              <CallupsModal
                game={callupsGame}
                open={callupsGame !== null}
                onClose={() => setCallupsGame(null)}
              />

              {/* Diálogo novo evento */}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingEventId ? "Editar Evento" : "Novo Evento"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tipo de Evento</Label>
                      <Select value={eventType} onValueChange={(v) => setEventType(v as "jogo" | "treino")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="jogo">Jogo</SelectItem>
                          <SelectItem value="treino">Treino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {eventType === "jogo" && (
                      <div className="space-y-2">
                        <Label>Tipo de Jogo</Label>
                        <Select value={gameType} onValueChange={(v) => setGameType(v as "official" | "friendly")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="official">Jogo Oficial (Liga / Taça)</SelectItem>
                            <SelectItem value="friendly">Jogo de Treino / Amigável</SelectItem>
                          </SelectContent>
                        </Select>
                        {gameType === "friendly" && (
                          <p className="text-xs text-muted-foreground">
                            Não conta para classificação. As estatísticas ficam registadas mas separadas dos jogos oficiais.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="title">Título *</Label>
                      <Input id="title" required value={formData.title}
                        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                        placeholder={eventType === "jogo" ? "Jogo vs. Lions BC" : "Treino tático"} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="event_date">Data *</Label>
                        <Input id="event_date" type="date" required value={formData.event_date}
                          onChange={(e) => setFormData((p) => ({ ...p, event_date: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="event_time">Hora *</Label>
                        <Input id="event_time" type="time" required value={formData.event_time}
                          onChange={(e) => setFormData((p) => ({ ...p, event_time: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Local *</Label>
                      <Input id="location" required value={formData.location}
                        onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                        placeholder="Pavilhão Municipal da Póvoa" />
                    </div>

                    {eventType === "jogo" && (
                      <div className="space-y-2">
                        <Label htmlFor="opponent">Adversário</Label>
                        <Input id="opponent" value={formData.opponent}
                          onChange={(e) => setFormData((p) => ({ ...p, opponent: e.target.value }))}
                          placeholder="Lions BC" />
                      </div>
                    )}

                    {eventType === "treino" && (
                      <div className="space-y-2">
                        <Label htmlFor="training_kind">Tipo de Treino</Label>
                        <Input id="training_kind" value={formData.training_kind}
                          onChange={(e) => setFormData((p) => ({ ...p, training_kind: e.target.value }))}
                          placeholder="físico, tático, colectivo..." />
                      </div>
                    )}

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingEventId(null); }}>Cancelar</Button>
                      <Button type="submit">{editingEventId ? "Guardar" : "Criar Evento"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Resultado Final Modal (admin/treinador) ── */}
      {!isPlayer && (
        <Dialog open={!!resultGame} onOpenChange={(o) => { if (!o) setResultGame(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Resultado Final</DialogTitle>
            </DialogHeader>
            {resultGame && (
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  {resultGame.title}{resultGame.opponent ? ` vs. ${resultGame.opponent}` : ""}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="res-home" className="text-xs font-semibold uppercase tracking-wide">
                      CD Póvoa Masters
                    </Label>
                    <Input
                      id="res-home"
                      type="number"
                      min={0}
                      step={1}
                      value={resultHome}
                      onChange={(e) => setResultHome(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="text-2xl font-bold text-center h-14 tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="res-away" className="text-xs font-semibold uppercase tracking-wide">
                      {resultGame.opponent ?? "Adversário"}
                    </Label>
                    <Input
                      id="res-away"
                      type="number"
                      min={0}
                      step={1}
                      value={resultAway}
                      onChange={(e) => setResultAway(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="text-2xl font-bold text-center h-14 tabular-nums"
                    />
                  </div>
                </div>
                {resultHome !== resultAway && (
                  <p className="text-sm text-center font-semibold" style={{
                    color: resultHome > resultAway ? "#16a34a" : "#dc2626",
                  }}>
                    {resultHome > resultAway ? "Vitória" : "Derrota"} — {Math.abs(resultHome - resultAway)} pontos de diferença
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setResultGame(null)} disabled={resultSaving}>
                Cancelar
              </Button>
              <Button onClick={submitResult} disabled={resultSaving}>
                {resultSaving ? "A guardar…" : "Guardar Resultado"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmação de remoção de evento (admin/treinador) */}
      {!isPlayer && (
        <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover evento?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{pendingDelete?.title}&rdquo; será eliminado permanentemente. Esta ação não pode ser revertida.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteEvent}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
