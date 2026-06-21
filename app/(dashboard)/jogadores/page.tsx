"use client";

import { useState } from "react";
import type { Metadata } from "next";
import { useSeasons } from "@/hooks/use-seasons";
import { usePlayers } from "@/hooks/use-players";
import { PlayersTable } from "@/components/players/players-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlayerWithUser, PlayerPosition } from "@/types/database";

export default function JogadoresPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { players, loading, upsertPlayer, deletePlayer } = usePlayers(seasonId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlayerWithUser | null>(null);
  const [formData, setFormData] = useState({
    jersey_number: "",
    position: "" as PlayerPosition | "",
    height_cm: "",
    age: "",
  });

  function openAdd() {
    setEditing(null);
    setFormData({ jersey_number: "", position: "", height_cm: "", age: "" });
    setDialogOpen(true);
  }

  function openEdit(player: PlayerWithUser) {
    setEditing(player);
    setFormData({
      jersey_number: player.jersey_number?.toString() ?? "",
      position: player.position ?? "",
      height_cm: player.height_cm?.toString() ?? "",
      age: player.age?.toString() ?? "",
    });
    setDialogOpen(true);
  }

  async function handleDelete(player: PlayerWithUser) {
    if (!confirm(`Remover ${player.user.name} do plantel?`)) return;
    await deletePlayer(player.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!seasonId || !editing) return;

    const ok = await upsertPlayer({
      user_id: editing.user_id,
      season_id: seasonId,
      jersey_number: formData.jersey_number ? Number(formData.jersey_number) : undefined,
      position: (formData.position as PlayerPosition) || undefined,
      height_cm: formData.height_cm ? Number(formData.height_cm) : undefined,
      age: formData.age ? Number(formData.age) : undefined,
    });

    if (ok) setDialogOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jogadores</h1>
          <p className="text-muted-foreground">Gestão do plantel por temporada</p>
        </div>

        {/* Seletor de temporada */}
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

      <PlayersTable
        players={players}
        loading={loading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      {/* Dialog de edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar — ${editing.user.name}` : "Adicionar Jogador"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jersey">Número de Camisola</Label>
                <Input
                  id="jersey"
                  type="number"
                  min={0}
                  max={99}
                  placeholder="8"
                  value={formData.jersey_number}
                  onChange={(e) => setFormData((p) => ({ ...p, jersey_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Posição</Label>
                <Select
                  value={formData.position}
                  onValueChange={(v) => setFormData((p) => ({ ...p, position: v as PlayerPosition }))}
                >
                  <SelectTrigger id="position">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="extremo">Extremo</SelectItem>
                    <SelectItem value="poste">Poste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Altura (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  min={100}
                  max={260}
                  placeholder="182"
                  value={formData.height_cm}
                  onChange={(e) => setFormData((p) => ({ ...p, height_cm: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Idade</Label>
                <Input
                  id="age"
                  type="number"
                  min={10}
                  max={100}
                  placeholder="35"
                  value={formData.age}
                  onChange={(e) => setFormData((p) => ({ ...p, age: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
