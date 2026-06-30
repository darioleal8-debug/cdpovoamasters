"use client";

import { useState } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { useRoster } from "@/hooks/use-roster";
import { useClubEvents } from "@/hooks/use-trainings";
import { TrainingsList } from "@/components/trainings/trainings-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Dumbbell, CalendarDays, Plus, MapPin, Clock, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

const TABS = [
  { id: "treinos", label: "Treinos",  icon: Dumbbell },
  { id: "eventos", label: "Eventos",  icon: CalendarDays },
] as const;
type TabId = typeof TABS[number]["id"];

export default function TreinosPage() {
  const [activeTab, setActiveTab] = useState<TabId>("treinos");

  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  // Plantel (para o modal de presenças)
  const { players, loading: playersLoading } = useRoster(seasonId);

  // Eventos do clube
  const { events, loading: eventsLoading, createEvent, deleteEvent } = useClubEvents(seasonId);

  // Modal novo evento
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "", description: "", date: "", start_time: "", location: "",
  });
  const [eventSaving, setEventSaving] = useState(false);

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!seasonId) return;
    setEventSaving(true);
    const ok = await createEvent({ ...eventForm, season_id: seasonId });
    setEventSaving(false);
    if (ok) {
      setEventModalOpen(false);
      setEventForm({ title: "", description: "", date: "", start_time: "", location: "" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Treinos &amp; Eventos</h1>
          <p className="text-muted-foreground">Gestão de treinos, presenças e eventos do clube</p>
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

      {/* Conteúdo */}
      {!seasonId ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <Dumbbell className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="font-medium">Seleciona uma temporada para começar</p>
        </div>
      ) : activeTab === "treinos" ? (
        <TrainingsList
          seasonId={seasonId}
          players={players}
          playersLoading={playersLoading}
        />
      ) : (
        /* ── Eventos do clube ─────────────────────────────── */
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setEventModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar Evento
            </Button>
          </div>

          {eventsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
              <CalendarDays className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium">Nenhum evento registado</p>
              <p className="text-sm mt-1">Cria reuniões, convívios, torneios ou outros eventos do clube.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  {/* Data */}
                  <div className="shrink-0 w-28">
                    <p className="text-sm font-semibold">
                      {format(parseISO(evt.date), "EEE, d MMM", { locale: pt })}
                    </p>
                    {evt.start_time && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {evt.start_time.slice(0, 5)}h
                      </p>
                    )}
                  </div>

                  {/* Título + descrição */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{evt.title}</p>
                    {evt.description && (
                      <p className="text-xs text-muted-foreground truncate">{evt.description}</p>
                    )}
                  </div>

                  {/* Local */}
                  {evt.location && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <MapPin className="h-3 w-3" />
                      {evt.location}
                    </div>
                  )}

                  {/* Apagar */}
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => { if (confirm(`Eliminar "${evt.title}"?`)) deleteEvent(evt.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Modal novo evento */}
          <Dialog open={eventModalOpen} onOpenChange={setEventModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Novo Evento</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-title">Título *</Label>
                  <Input id="ev-title" required placeholder="Reunião de equipa"
                    value={eventForm.title}
                    onChange={(e) => setEventForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-date">Data *</Label>
                    <Input id="ev-date" type="date" required value={eventForm.date}
                      onChange={(e) => setEventForm((p) => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-time">Hora</Label>
                    <Input id="ev-time" type="time" value={eventForm.start_time}
                      onChange={(e) => setEventForm((p) => ({ ...p, start_time: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-location">Local</Label>
                  <Input id="ev-location" placeholder="Sede do clube"
                    value={eventForm.location}
                    onChange={(e) => setEventForm((p) => ({ ...p, location: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-desc">Descrição</Label>
                  <textarea
                    id="ev-desc"
                    className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Informações adicionais..."
                    value={eventForm.description}
                    onChange={(e) => setEventForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEventModalOpen(false)} disabled={eventSaving}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={eventSaving}>
                    {eventSaving ? "A criar..." : "Criar Evento"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
