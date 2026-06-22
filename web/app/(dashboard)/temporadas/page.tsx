"use client";

import { useState } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Zap, Trash2, CalendarRange } from "lucide-react";
import type { Season, SeasonFormData } from "@/types/database";

const EMPTY_FORM: SeasonFormData = { name: "", year: "", start_date: "", end_date: "" };

function SeasonRow({
  season,
  onEdit,
  onActivate,
  onDelete,
}: {
  season: Season;
  onEdit: (s: Season) => void;
  onActivate: (s: Season) => void;
  onDelete: (s: Season) => void;
}) {
  const isActive = season.status === "ativa";

  return (
    <div className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${isActive ? "border-cdpovoa-blue/40 bg-cdpovoa-blue/5" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isActive ? "bg-cdpovoa-blue text-white" : "bg-muted text-muted-foreground"}`}>
          <CalendarRange className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{season.name}</span>
            {isActive && (
              <Badge className="bg-cdpovoa-blue text-white text-[0.65rem]">Ativa</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{season.year}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(season.start_date).toLocaleDateString("pt-PT")}
            {" — "}
            {new Date(season.end_date).toLocaleDateString("pt-PT")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:shrink-0">
        {!isActive && (
          <Button
            size="sm"
            variant="outline"
            className="border-cdpovoa-blue text-cdpovoa-blue hover:bg-cdpovoa-blue hover:text-white"
            onClick={() => onActivate(season)}
          >
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Ativar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onEdit(season)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Editar
        </Button>
        {!isActive && (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive hover:text-white"
            onClick={() => onDelete(season)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function TemporadasPage() {
  const {
    seasons,
    activeSeason,
    loading,
    createSeason,
    updateSeason,
    activateSeason,
    deleteSeason,
  } = useSeasons();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState<Season | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Season | null>(null);
  const [editing, setEditing] = useState<Season | null>(null);
  const [form, setForm] = useState<SeasonFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(season: Season) {
    setEditing(season);
    setForm({
      name: season.name,
      year: season.year,
      start_date: season.start_date,
      end_date: season.end_date,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ok = editing
      ? await updateSeason(editing.id, form)
      : await createSeason(form);
    setSaving(false);
    if (ok) setDialogOpen(false);
  }

  async function handleActivate() {
    if (!confirmActivate) return;
    setSaving(true);
    await activateSeason(confirmActivate.id);
    setSaving(false);
    setConfirmActivate(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setSaving(true);
    await deleteSeason(confirmDelete.id);
    setSaving(false);
    setConfirmDelete(null);
  }

  const archived = seasons.filter((s) => s.status !== "ativa");

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Temporadas</h1>
          <p className="text-muted-foreground">Gerir as épocas desportivas do clube</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Temporada
        </Button>
      </div>

      {/* Temporada ativa */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Temporada Ativa
        </h2>
        {loading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : activeSeason ? (
          <SeasonRow
            season={activeSeason}
            onEdit={openEdit}
            onActivate={setConfirmActivate}
            onDelete={setConfirmDelete}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma temporada ativa. Ativa uma das temporadas abaixo.
            </CardContent>
          </Card>
        )}
      </section>

      {/* Histórico */}
      {(loading || archived.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Histórico
          </h2>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : (
            <div className="space-y-3">
              {archived.map((s) => (
                <SeasonRow
                  key={s.id}
                  season={s}
                  onEdit={openEdit}
                  onActivate={setConfirmActivate}
                  onDelete={setConfirmDelete}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Dialog criar / editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Temporada" : "Nova Temporada"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                required
                placeholder="Masters 2025/26"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Ano *</Label>
              <Input
                id="year"
                required
                placeholder="2025/2026"
                value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Data de Início *</Label>
                <Input
                  id="start_date"
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Data de Fim *</Label>
                <Input
                  id="end_date"
                  type="date"
                  required
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? "Guardar Alterações" : "Criar Temporada"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm ativar */}
      <Dialog open={!!confirmActivate} onOpenChange={() => setConfirmActivate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar Temporada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tens a certeza que queres ativar{" "}
            <strong>{confirmActivate?.name}</strong>?{" "}
            {activeSeason && (
              <>A temporada atual <strong>{activeSeason.name}</strong> passará para o histórico.</>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmActivate(null)}>
              Cancelar
            </Button>
            <Button onClick={handleActivate} disabled={saving} className="bg-cdpovoa-blue hover:bg-cdpovoa-blue-mid">
              <Zap className="mr-2 h-4 w-4" />
              Ativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm eliminar */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Temporada</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Eliminar <strong>{confirmDelete?.name}</strong>? Esta ação também remove todos os dados
            associados (jogadores, jogos, pagamentos). Esta operação é irreversível.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
