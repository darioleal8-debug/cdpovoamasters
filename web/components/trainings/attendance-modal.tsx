"use client";

import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, MapPin, Camera, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAttendance } from "@/hooks/use-trainings";
import type { Training, RosterEntry, AttendanceStatus, TrainingAttendance } from "@/types/database";

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string }> = {
  present:      { label: "Presente",      color: "bg-green-100 text-green-800 border-green-300 hover:bg-green-200" },
  late:         { label: "Atraso",        color: "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200" },
  justified:    { label: "Justificada",   color: "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200" },
  absent:       { label: "Falta",         color: "bg-red-100 text-red-800 border-red-300 hover:bg-red-200" },
  auto_present: { label: "Auto-Presença", color: "bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200" },
};

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "justified", "absent"];

interface Props {
  training: Training | null;
  players: RosterEntry[];
  open: boolean;
  onClose: () => void;
}

export function AttendanceModal({ training, players, open, onClose }: Props) {
  const { attendance, loading, saveAttendance, validateAttendance } = useAttendance(training?.id ?? null);
  const [local, setLocal] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [autoExpanded, setAutoExpanded] = useState(true);

  useEffect(() => {
    const map: Record<string, AttendanceStatus> = {};
    for (const a of attendance) map[a.player_id] = a.status;
    setLocal(map);
  }, [attendance]);

  // Mapa player_id → registo completo (para auto-presença)
  const attendanceRecordMap = useMemo(() => {
    const m = new Map<string, TrainingAttendance>();
    for (const a of attendance) m.set(a.player_id, a);
    return m;
  }, [attendance]);

  // Jogadores com auto-presença pendente de validação
  const autoPendingPlayers = useMemo(
    () => players.filter((p) => local[p.player_id ?? ""] === "auto_present"),
    [players, local]
  );

  function setStatus(playerId: string, status: AttendanceStatus) {
    setLocal((prev) => ({ ...prev, [playerId]: status }));
  }

  async function handleValidate(record: TrainingAttendance, action: "approve" | "reject") {
    setValidating(record.id);
    await validateAttendance(record.id, action);
    setValidating(null);
  }

  async function handleSave() {
    setSaving(true);
    const records = players
      .filter((p) => p.player_id && local[p.player_id])
      .map((p) => ({ player_id: p.player_id!, status: local[p.player_id!] }));
    await saveAttendance(records);
    setSaving(false);
    onClose();
  }

  const stats = {
    present:      players.filter((p) => local[p.player_id ?? ""] === "present").length,
    late:         players.filter((p) => local[p.player_id ?? ""] === "late").length,
    justified:    players.filter((p) => local[p.player_id ?? ""] === "justified").length,
    absent:       players.filter((p) => local[p.player_id ?? ""] === "absent").length,
    auto_present: players.filter((p) => local[p.player_id ?? ""] === "auto_present").length,
    total:        players.length,
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
          {STATUS_ORDER.map((s) => (
            <Badge key={s} variant="outline" className={cn("gap-1", STATUS_CONFIG[s].color)}>
              {STATUS_CONFIG[s].label}: {stats[s]}
            </Badge>
          ))}
          {stats.auto_present > 0 && (
            <Badge variant="outline" className={cn("gap-1", STATUS_CONFIG.auto_present.color)}>
              <Camera className="h-3 w-3" />
              Auto: {stats.auto_present}
            </Badge>
          )}
          <Badge variant="outline" className="ml-auto">
            Marcados: {Object.keys(local).filter((id) => local[id]).length} / {stats.total}
          </Badge>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {/* Secção Auto-Presenças */}
          {autoPendingPlayers.length > 0 && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-950/20">
              <button
                type="button"
                onClick={() => setAutoExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-violet-800 dark:text-violet-300"
              >
                <span className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Auto-Presenças Pendentes ({autoPendingPlayers.length})
                </span>
                {autoExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {autoExpanded && (
                <div className="border-t border-violet-200 dark:border-violet-800 divide-y divide-violet-100 dark:divide-violet-900">
                  {autoPendingPlayers.map((player) => {
                    const record = attendanceRecordMap.get(player.player_id ?? "");
                    if (!record) return null;
                    const isValidating = validating === record.id;
                    return (
                      <div key={player.user_id} className="flex items-center gap-3 px-3 py-2.5">
                        {/* Foto miniatura */}
                        {record.photo_url ? (
                          <a href={record.photo_url} target="_blank" rel="noreferrer" className="shrink-0">
                            <img
                              src={record.photo_url}
                              alt={`Foto de ${player.name}`}
                              className="h-10 w-10 rounded object-cover border border-violet-200"
                            />
                          </a>
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                            <Camera className="h-5 w-5 text-violet-400" />
                          </div>
                        )}

                        {/* Nome + GPS info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{player.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {record.gps_validated ? (
                              <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                                <MapPin className="h-3 w-3" />
                                GPS validado ({record.gps_distance_m}m)
                              </span>
                            ) : record.gps_distance_m !== null ? (
                              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <MapPin className="h-3 w-3" />
                                {record.gps_distance_m}m do local
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Sem dados GPS</span>
                            )}
                          </div>
                        </div>

                        {/* Botões Aprovar / Rejeitar */}
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isValidating}
                            onClick={() => handleValidate(record, "approve")}
                            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aprovar
                          </button>
                          <button
                            type="button"
                            disabled={isValidating}
                            onClick={() => handleValidate(record, "reject")}
                            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Lista de jogadores */}
          <div className="space-y-1.5">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))
              : players.length === 0
              ? <p className="py-8 text-center text-muted-foreground text-sm">
                  Nenhum jogador no plantel desta temporada.
                </p>
              : players.map((player) => {
                  const status = local[player.player_id ?? ""] as AttendanceStatus | undefined;
                  const isAuto = status === "auto_present";
                  return (
                    <div
                      key={player.user_id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-card px-3 py-2",
                        isAuto && "border-violet-200 bg-violet-50/30 dark:border-violet-800 dark:bg-violet-950/10"
                      )}
                    >
                      <span className="w-7 shrink-0 text-center text-xs font-mono text-muted-foreground">
                        {player.number ?? "—"}
                      </span>
                      <span className="flex-1 text-sm font-medium truncate">{player.name}</span>

                      {/* Badge auto-presença */}
                      {isAuto && (
                        <Badge variant="outline" className={cn("text-[10px] shrink-0", STATUS_CONFIG.auto_present.color)}>
                          <Camera className="h-2.5 w-2.5 mr-1" />
                          Auto
                        </Badge>
                      )}

                      {/* Botões de estado manual */}
                      <div className="flex gap-1">
                        {STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            onClick={() => setStatus(player.player_id ?? player.user_id, s)}
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
