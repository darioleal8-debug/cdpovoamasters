"use client";

import { useState } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { useGames } from "@/hooks/use-games";
import { useLeagueCalendar } from "@/hooks/use-league-calendar";
import { useTeamKits } from "@/hooks/use-team-kits";
import { GamesTable } from "@/components/games/games-table";
import { CallupsModal } from "@/components/games/callups-modal";
import { LeagueCalendar } from "@/components/games/league-calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, CalendarDays } from "lucide-react";
import type { Event } from "@/types/database";

export default function JogosPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { events, loading: eventsLoading, createGame, createTraining, updateEvent, deleteEvent } = useGames(seasonId);

  const {
    jornadas, allJornadas, stats, loading: ligaLoading,
    showOnlyOurs, setShowOnlyOurs,
    selectedJornada, setSelectedJornada,
  } = useLeagueCalendar(seasonId);

  const { kitsByTeam } = useTeamKits();

  const [callupsGame, setCallupsGame] = useState<Event | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Event | null>(null);

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

      <Tabs defaultValue="liga" className="space-y-6">
        <TabsList>
          <TabsTrigger value="liga" className="gap-2">
            <Trophy className="h-4 w-4" />Calendário Liga
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2">
            <CalendarDays className="h-4 w-4" />Agenda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="liga">
          <LeagueCalendar
            jornadas={jornadas}
            allJornadas={allJornadas}
            stats={stats}
            loading={ligaLoading}
            showOnlyOurs={showOnlyOurs}
            onToggleOurs={setShowOnlyOurs}
            selectedJornada={selectedJornada}
            onSelectJornada={setSelectedJornada}
            kitsByTeam={kitsByTeam}
          />
        </TabsContent>

        <TabsContent value="agenda" className="space-y-4">
          <GamesTable
            events={events}
            loading={eventsLoading}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={handleDelete}
            onCallups={setCallupsGame}
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

                {/* Tipo de jogo — apenas visível quando o evento é um jogo */}
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
        </TabsContent>
      </Tabs>

      {/* Confirmação de remoção de evento */}
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
    </div>
  );
}
