"use client";

import { useState, useMemo } from "react";
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { pt } from "date-fns/locale";
import { Plus, Users, FileText, Pencil, Trash2, Clock, MapPin, BarChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AttendanceModal } from "./attendance-modal";
import { NotesModal } from "./notes-modal";
import { CreateTrainingModal } from "./create-training-modal";
import { useTrainings, usePlayerAttendanceStats } from "@/hooks/use-trainings";
import type { Training, Player, TrainingType } from "@/types/database";
import { TRAINING_TYPE_LABELS } from "@/types/database";

// ── Cores por tipo de treino ──────────────────────────────

const TYPE_COLORS: Record<TrainingType, string> = {
  tecnico:     "bg-blue-100  text-blue-800  border-blue-300",
  fisico:      "bg-orange-100 text-orange-800 border-orange-300",
  tatico:      "bg-purple-100 text-purple-800 border-purple-300",
  recuperacao: "bg-teal-100  text-teal-800  border-teal-300",
  coletivo:    "bg-green-100 text-green-800 border-green-300",
  individual:  "bg-yellow-100 text-yellow-800 border-yellow-300",
  geral:       "bg-muted     text-muted-foreground",
};

// ── Componente principal ──────────────────────────────────

interface Props {
  seasonId: string;
  players: Player[];
  playersLoading: boolean;
}

export function TrainingsList({ seasonId, players, playersLoading }: Props) {
  const { trainings, loading, createTraining, updateTraining, deleteTraining } = useTrainings(seasonId);
  const { stats: attendanceStats } = usePlayerAttendanceStats(seasonId);

  // Modals
  const [createOpen, setCreateOpen]         = useState(false);
  const [attendanceTraining, setAttendance] = useState<Training | null>(null);
  const [notesTraining, setNotes]           = useState<Training | null>(null);
  const [editTraining, setEdit]             = useState<Training | null>(null);

  // Filtros
  const [filterType, setFilterType]   = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [filterMonth, setFilterMonth]   = useState<string>("all");

  // Meses disponíveis
  const months = useMemo(() => {
    const set = new Set(trainings.map((t) => t.date.slice(0, 7)));
    return [...set].sort();
  }, [trainings]);

  // Filtrar
  const filtered = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });

    return trainings.filter((t) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterMonth !== "all" && !t.date.startsWith(filterMonth)) return false;
      if (filterPeriod === "week") {
        const d = parseISO(t.date);
        return isWithinInterval(d, { start: weekStart, end: weekEnd });
      }
      if (filterPeriod === "future") return t.date >= now.toISOString().slice(0, 10);
      if (filterPeriod === "past")   return t.date <  now.toISOString().slice(0, 10);
      return true;
    });
  }, [trainings, filterType, filterMonth, filterPeriod]);

  // Estatísticas globais da equipa
  const teamStats = useMemo(() => {
    const total = trainings.length;
    const allPct = Object.values(attendanceStats).map((s) => s.pct);
    const avgPct = allPct.length ? allPct.reduce((a, b) => a + b, 0) / allPct.length : 0;
    return { total, avgPct: Math.round(avgPct * 10) / 10 };
  }, [trainings, attendanceStats]);

  function handleDelete(t: Training) {
    if (!confirm(`Eliminar treino de ${t.date}?`)) return;
    deleteTraining(t.id);
  }

  return (
    <div className="space-y-5">
      {/* Barra de stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total de treinos",    value: teamStats.total },
          { label: "Filtrados",           value: filtered.length },
          { label: "Assiduidade média",   value: `${teamStats.avgPct}%` },
          { label: "Jogadores no plantel", value: players.length },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-cdpovoa-blue">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros + botão adicionar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(TRAINING_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="future">Futuros</SelectItem>
              <SelectItem value="past">Passados</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {format(parseISO(`${m}-01`), "MMMM yyyy", { locale: pt })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar Treino
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              {["Data", "Hora", "Local", "Tipo", "Assiduidade", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading || playersLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
              ? <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum treino encontrado.
                  </td>
                </tr>
              : filtered.map((t) => {
                  const isPast = t.date < new Date().toISOString().slice(0, 10);
                  // Contar presenças a partir das estatísticas por jogador
                  const presentCount = players.filter((p) => {
                    // Aproximação via attendanceStats: não é por treino, mas é útil para mostrar algo
                    // Para o detalhe real, usa o AttendanceModal
                    return attendanceStats[p.id];
                  }).length;

                  return (
                    <tr key={t.id} className={cn("hover:bg-muted/30 transition-colors", isPast && "opacity-70")}>
                      {/* Data */}
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {format(parseISO(t.date), "EEE, d MMM yyyy", { locale: pt })}
                      </td>
                      {/* Hora */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {t.start_time.slice(0, 5)}
                          {t.end_time ? `–${t.end_time.slice(0, 5)}` : ""}h
                        </span>
                      </td>
                      {/* Local */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-muted-foreground truncate max-w-[200px]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {t.location || "—"}
                        </span>
                      </td>
                      {/* Tipo */}
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn("text-xs", TYPE_COLORS[t.type])}>
                          {TRAINING_TYPE_LABELS[t.type]}
                        </Badge>
                      </td>
                      {/* Assiduidade */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setAttendance(t)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          title="Ver/editar presenças"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>{presentCount > 0 ? `${presentCount} marcados` : "Marcar"}</span>
                        </button>
                      </td>
                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1"
                            onClick={() => setAttendance(t)}>
                            <Users className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline text-xs">Presenças</span>
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1"
                            onClick={() => setNotes(t)}>
                            <FileText className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline text-xs">Notas</span>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setEdit(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(t)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Secção de assiduidade dos jogadores */}
      {Object.keys(attendanceStats).length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart className="h-4 w-4" /> Assiduidade dos Jogadores
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  {["Jogador", "Nº", "Treinos", "Presente", "Falta", "Just.", "Atraso", "%"].map((h) => (
                    <th key={h} className="px-3 py-1.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {players
                  .filter((p) => attendanceStats[p.id])
                  .sort((a, b) => (attendanceStats[b.id]?.pct ?? 0) - (attendanceStats[a.id]?.pct ?? 0))
                  .map((p) => {
                    const s = attendanceStats[p.id];
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.number ?? "—"}</td>
                        <td className="px-3 py-2">{s.total}</td>
                        <td className="px-3 py-2 text-green-700">{s.present}</td>
                        <td className="px-3 py-2 text-red-600">{s.absent}</td>
                        <td className="px-3 py-2 text-blue-600">{s.justified}</td>
                        <td className="px-3 py-2 text-yellow-700">{s.late}</td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "font-semibold",
                            s.pct >= 80 ? "text-green-700" : s.pct >= 60 ? "text-yellow-700" : "text-red-600"
                          )}>
                            {s.pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modais */}
      <CreateTrainingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        seasonId={seasonId}
        onSubmit={createTraining}
      />
      <AttendanceModal
        training={attendanceTraining}
        players={players}
        open={attendanceTraining !== null}
        onClose={() => setAttendance(null)}
      />
      <NotesModal
        training={notesTraining}
        open={notesTraining !== null}
        onClose={() => setNotes(null)}
      />

      {/* Edit inline (reutiliza CreateTrainingModal em modo edição) */}
      {editTraining && (
        <Dialog open onOpenChange={() => setEdit(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Treino</DialogTitle>
            </DialogHeader>
            <EditTrainingForm
              training={editTraining}
              onSubmit={async (body) => {
                const ok = await updateTraining(editTraining.id, body);
                if (ok) setEdit(null);
                return ok;
              }}
              onClose={() => setEdit(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Edit inline ──────────────────────────────────────────
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function EditTrainingForm({
  training,
  onSubmit,
  onClose,
}: {
  training: Training;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    date:       training.date,
    start_time: training.start_time.slice(0, 5),
    end_time:   training.end_time?.slice(0, 5) ?? "",
    location:   training.location,
    type:       training.type,
    notes:      training.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSubmit({ ...form, end_time: form.end_time || undefined, notes: form.notes || undefined });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Data *</Label>
          <Input type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Início *</Label>
          <Input type="time" required value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Fim</Label>
          <Input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Local *</Label>
        <Input required value={form.location} onChange={(e) => set("location", e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={form.type} onValueChange={(v) => set("type", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(TRAINING_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Notas</Label>
        <textarea
          className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={saving}>
          {saving ? "A guardar..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
