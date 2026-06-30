"use client";

import { useState } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { useGames } from "@/hooks/use-games";
import { useLeagueCalendar } from "@/hooks/use-league-calendar";
import { useTeamKits } from "@/hooks/use-team-kits";
import { GamesTable } from "@/components/games/games-table";
import { CallupsModal } from "@/components/games/callups-modal";
import { LeagueCalendar } from "@/components/games/league-calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Trophy, CalendarDays } from "lucide-react";
import type { Event } from "@/types/database";

// ─── Tab switcher ─────────────────────────────────────────

const TABS = [
  { id: "liga",   label: "Calendário Liga", icon: Trophy },
  { id: "agenda", label: "Agenda",          icon: CalendarDays },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Página ───────────────────────────────────────────────

export default function JogosPage() {
  const [activeTab, setActiveTab] = useState<TabId>("liga");

  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  // Hook agenda (eventos todos)
  const { events, loading: eventsLoading, createGame, createTraining, deleteEvent } =
    useGames(seasonId);

  // Hook calendário liga
  const {
    jornadas, allJornadas, stats, loading: ligaLoading,
    showOnlyOurs, setShowOnlyOurs,
    selectedJornada, setSelectedJornada,
  } = useLeagueCalendar(seasonId);

  // Kit colors for teams
  const { kitsByTeam } = useTeamKits();

  // Modal de convocados
  const [callupsGame, setCallupsGame] = useState<Event | null>(null);

  // Diálogo novo evento
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [eventType, setEventType]     = useState<"jogo" | "treino">("jogo");
  const [formData, setFormData]       = useState({
    title: "", location: "", event_date: "", event_time: "",
    opponent: "", training_kind: "", description: "",
  });

  function openAdd() {
    setFormData({ title: "", location: "", event_date: "", event_time: "",
                  opponent: "", training_kind: "", description: "" });
    setDialogOpen(true);
  }

  async function handleDelete(event: Event) {
    if (!confirm(`Remover "${event.title}"?`)) return;
    await deleteEvent(event.id);
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
    const ok = eventType === "jogo"
      ? await createGame({ ...base, opponent: formData.opponent || undefined })
      : await createTraining({ ...base, training_kind: formData.training_kind || undefined });
    if (ok) setDialogOpen(false);
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jogos</h1>
          <p className="text-muted-foreground">Calendário da Liga e agenda de eventos</p>
        </div>
        <Select
          value={seasonId ?? ""}
          onValueChange={setSelectedSeasonId}
          disabled={seasonsLoading}
        >
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

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo das tabs */}
      {activeTab === "liga" && (
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
      )}

      {activeTab === "agenda" && (
        <>
          <GamesTable
            events={events}
            loading={eventsLoading}
            onAdd={openAdd}
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
                <DialogTitle>Novo Evento</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Evento</Label>
                  <Select
                    value={eventType}
                    onValueChange={(v) => setEventType(v as "jogo" | "treino")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jogo">Jogo</SelectItem>
                      <SelectItem value="treino">Treino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title" required value={formData.title}
                    onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                    placeholder={eventType === "jogo" ? "Jogo vs. Lions BC" : "Treino tático"}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="event_date">Data *</Label>
                    <Input
                      id="event_date" type="date" required value={formData.event_date}
                      onChange={(e) => setFormData((p) => ({ ...p, event_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event_time">Hora *</Label>
                    <Input
                      id="event_time" type="time" required value={formData.event_time}
                      onChange={(e) => setFormData((p) => ({ ...p, event_time: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Local *</Label>
                  <Input
                    id="location" required value={formData.location}
                    onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                    placeholder="Pavilhão Municipal da Póvoa"
                  />
                </div>

                {eventType === "jogo" && (
                  <div className="space-y-2">
                    <Label htmlFor="opponent">Adversário</Label>
                    <Input
                      id="opponent" value={formData.opponent}
                      onChange={(e) => setFormData((p) => ({ ...p, opponent: e.target.value }))}
                      placeholder="Lions BC"
                    />
                  </div>
                )}

                {eventType === "treino" && (
                  <div className="space-y-2">
                    <Label htmlFor="training_kind">Tipo de Treino</Label>
                    <Input
                      id="training_kind" value={formData.training_kind}
                      onChange={(e) => setFormData((p) => ({ ...p, training_kind: e.target.value }))}
                      placeholder="físico, tático, colectivo..."
                    />
                  </div>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Criar Evento</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
