"use client";

import { useState } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { useGames } from "@/hooks/use-games";
import { GamesTable } from "@/components/games/games-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Event } from "@/types/database";

export default function JogosPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { events, loading, createGame, createTraining, deleteEvent } = useGames(seasonId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventType, setEventType] = useState<"jogo" | "treino">("jogo");
  const [formData, setFormData] = useState({
    title: "", location: "", event_date: "", event_time: "",
    opponent: "", training_kind: "", description: "",
  });

  function openAdd() {
    setFormData({ title: "", location: "", event_date: "", event_time: "", opponent: "", training_kind: "", description: "" });
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jogos &amp; Treinos</h1>
          <p className="text-muted-foreground">Calendário de eventos da temporada</p>
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

      <GamesTable
        events={events}
        loading={loading}
        onAdd={openAdd}
        onDelete={handleDelete}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo */}
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit">Criar Evento</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
