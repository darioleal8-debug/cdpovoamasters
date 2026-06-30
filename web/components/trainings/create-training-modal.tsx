"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRAINING_TYPE_LABELS, type TrainingType, type RecurrenceType } from "@/types/database";

const DAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Props {
  open: boolean;
  onClose: () => void;
  seasonId: string;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}

export function CreateTrainingModal({ open, onClose, seasonId, onSubmit }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date:             "",
    start_time:       "",
    end_time:         "",
    location:         "",
    type:             "geral" as TrainingType,
    notes:            "",
    recurrence_type:  "unique" as RecurrenceType,
    day_of_week:      "1",
    day_of_month:     "1",
    end_date:         "",
  });

  function set(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const ok = await onSubmit({
      season_id: seasonId,
      date:             form.date,
      start_time:       form.start_time,
      end_time:         form.end_time || undefined,
      location:         form.location,
      type:             form.type,
      notes:            form.notes || undefined,
      recurrence_type:  form.recurrence_type,
      day_of_week:      form.recurrence_type === "weekly"  ? Number(form.day_of_week)  : undefined,
      day_of_month:     form.recurrence_type === "monthly" ? Number(form.day_of_month) : undefined,
      end_date:         form.end_date || undefined,
    });
    setLoading(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Treino</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Data + Hora início + Hora fim */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data *</Label>
              <Input id="date" type="date" required value={form.date}
                onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start_time">Início *</Label>
              <Input id="start_time" type="time" required value={form.start_time}
                onChange={(e) => set("start_time", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_time">Fim</Label>
              <Input id="end_time" type="time" value={form.end_time}
                onChange={(e) => set("end_time", e.target.value)} />
            </div>
          </div>

          {/* Local */}
          <div className="space-y-1.5">
            <Label htmlFor="location">Local / Pavilhão *</Label>
            <Input id="location" required placeholder="Pavilhão Municipal da Póvoa"
              value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo de Treino</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRAINING_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Periodicidade */}
          <div className="space-y-1.5">
            <Label>Periodicidade</Label>
            <Select value={form.recurrence_type} onValueChange={(v) => set("recurrence_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unique">Único (sem repetição)</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Semanal: dia da semana */}
          {form.recurrence_type === "weekly" && (
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Select value={form.day_of_week} onValueChange={(v) => set("day_of_week", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS_PT.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Mensal: dia do mês */}
          {form.recurrence_type === "monthly" && (
            <div className="space-y-1.5">
              <Label>Dia do mês</Label>
              <Select value={form.day_of_month} onValueChange={(v) => set("day_of_month", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>Dia {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Data de fim da recorrência */}
          {form.recurrence_type !== "unique" && (
            <div className="space-y-1.5">
              <Label htmlFor="end_date">Data de fim da recorrência</Label>
              <Input id="end_date" type="date" value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Deixar vazio para usar o fim da temporada
              </p>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas / Comentários</Label>
            <textarea
              id="notes"
              className="w-full min-h-[70px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Observações gerais sobre o treino..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "A criar..." : "Criar Treino"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
