"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAttendance } from "@/hooks/use-trainings";
import type { Training, Player, AttendanceStatus } from "@/types/database";

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string }> = {
  present:   { label: "Presente",     color: "bg-green-100 text-green-800 border-green-300 hover:bg-green-200" },
  late:      { label: "Atraso",       color: "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200" },
  justified: { label: "Justificada",  color: "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200" },
  absent:    { label: "Falta",        color: "bg-red-100 text-red-800 border-red-300 hover:bg-red-200" },
};

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "justified", "absent"];

interface Props {
  training: Training | null;
  players: Player[];
  open: boolean;
  onClose: () => void;
}

export function AttendanceModal({ training, players, open, onClose }: Props) {
  const { attendance, loading, saveAttendance } = useAttendance(training?.id ?? null);

  // Local state: player_id → status
  const [local, setLocal] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  // Sync attendance from DB into local state
  useEffect(() => {
    const map: Record<string, AttendanceStatus> = {};
    for (const a of attendance) map[a.player_id] = a.status;
    setLocal(map);
  }, [attendance]);

  function toggle(playerId: string) {
    setLocal((prev) => {
      const curr = prev[playerId] as AttendanceStatus | undefined;
      const idx  = curr ? STATUS_ORDER.indexOf(curr) : -1;
      const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
      return { ...prev, [playerId]: next };
    });
  }

  function setStatus(playerId: string, status: AttendanceStatus) {
    setLocal((prev) => ({ ...prev, [playerId]: status }));
  }

  async function handleSave() {
    setSaving(true);
    const records = players
      .filter((p) => local[p.id])
      .map((p) => ({ player_id: p.id, status: local[p.id] }));
    await saveAttendance(records);
    setSaving(false);
    onClose();
  }

  const stats = {
    present:   players.filter((p) => local[p.id] === "present").length,
    late:      players.filter((p) => local[p.id] === "late").length,
    justified: players.filter((p) => local[p.id] === "justified").length,
    absent:    players.filter((p) => local[p.id] === "absent").length,
    total:     players.length,
  };

  if (!training) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Presenças — {training.date} · {training.start_time.slice(0, 5)}h
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{training.location}</p>
        </DialogHeader>

        {/* Resumo */}
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([s, cfg]) => (
            <Badge key={s} variant="outline" className={cn("gap-1", cfg.color)}>
              {cfg.label}: {stats[s as keyof typeof stats]}
            </Badge>
          ))}
          <Badge variant="outline" className="ml-auto">
            Marcados: {Object.keys(local).filter((id) => local[id]).length} / {stats.total}
          </Badge>
        </div>

        {/* Lista de jogadores */}
        <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))
            : players.length === 0
            ? <p className="py-8 text-center text-muted-foreground text-sm">
                Nenhum jogador no plantel desta temporada.
              </p>
            : players.map((player) => {
                const status = local[player.id] as AttendanceStatus | undefined;
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
                  >
                    {/* Número + Nome */}
                    <span className="w-7 shrink-0 text-center text-xs font-mono text-muted-foreground">
                      {player.number ?? "—"}
                    </span>
                    <span className="flex-1 text-sm font-medium truncate">{player.name}</span>

                    {/* Botões de estado */}
                    <div className="flex gap-1">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(player.id, s)}
                          className={cn(
                            "rounded px-2 py-0.5 text-[11px] font-medium border transition-all",
                            status === s
                              ? STATUS_CONFIG[s].color
                              : "border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || players.length === 0}>
            {saving ? "A guardar..." : "Guardar Presenças"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
