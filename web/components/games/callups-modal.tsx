"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Check, HelpCircle, UserMinus, UserPlus, Users, X, Loader2,
} from "lucide-react";
import { useGameCallups } from "@/hooks/use-game-callups";
import { useRoster } from "@/hooks/use-roster";
import { formatDateShort } from "@/lib/utils";
import { RSVP_REASON_LABELS } from "@/types/database";
import type { Event } from "@/types/database";
import type { AvailabilityRosterRow } from "@/types/availability";

interface Props {
  game: Event | null;
  open: boolean;
  onClose: () => void;
}

export function CallupsModal({ game, open, onClose }: Props) {
  const { callups, loading, addCallup, removeCallup } = useGameCallups(game?.id ?? null);
  const { players: roster, loading: rosterLoading } = useRoster(game?.season_id ?? null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState<string | null>(null);

  const calledUpIds = useMemo(
    () => new Set(callups.map((c) => c.player_id)),
    [callups]
  );

  // ── Disponibilidade ──────────────────────────────────────
  const gameId = game?.id ?? null;
  const [availability, setAvailability] = useState<AvailabilityRosterRow[]>([]);
  const [availLoading, setAvailLoading] = useState(false);

  useEffect(() => {
    if (!gameId || !open) { setAvailability([]); return; }
    let cancelled = false;
    setAvailLoading(true);
    fetch(`/api/games/${gameId}/availability`)
      .then((res) => (res.ok ? res.json() : { players: [] }))
      .then((json) => { if (!cancelled) setAvailability(json.players ?? []); })
      .catch(() => { if (!cancelled) setAvailability([]); })
      .finally(() => { if (!cancelled) setAvailLoading(false); });
    return () => { cancelled = true; };
  }, [gameId, open]);

  const availableRows   = useMemo(() => availability.filter((a) => a.status === "available"), [availability]);
  const unavailableRows = useMemo(() => availability.filter((a) => a.status === "unavailable"), [availability]);
  const pendingRows     = useMemo(() => availability.filter((a) => !a.status), [availability]);

  // ── Convocar a partir da lista de disponíveis ───────────
  async function quickConvoke(playerId: string) {
    setQuickSaving(playerId);
    await addCallup(playerId);
    setQuickSaving(null);
  }

  // ── Dropdown para adicionar convocado ───────────────────
  const AVAILABILITY_ORDER: Record<string, number> = { available: 0, none: 1, unavailable: 2 };
  const availabilityByPlayer = useMemo(
    () => new Map(availability.map((a) => [a.player_id, a.status ?? "none"])),
    [availability]
  );

  const dropdownPlayers = useMemo(
    () =>
      roster
        .filter((p) => p.player_id && !calledUpIds.has(p.player_id))
        .slice()
        .sort((a, b) =>
          (AVAILABILITY_ORDER[availabilityByPlayer.get(a.player_id ?? "") ?? "none"] ?? 1) -
          (AVAILABILITY_ORDER[availabilityByPlayer.get(b.player_id ?? "") ?? "none"] ?? 1)
        ),
    [roster, calledUpIds, availabilityByPlayer]
  );

  async function handleAdd() {
    if (!selectedPlayerId) return;
    setSaving(true);
    const ok = await addCallup(selectedPlayerId);
    if (ok) setSelectedPlayerId("");
    setSaving(false);
  }

  if (!game) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[88vh] flex flex-col gap-0 p-0">
        {/* Header fixo */}
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 shrink-0" />
            {game.title}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {formatDateShort(game.event_date)} · {game.event_time.slice(0, 5)}h
            {game.opponent ? ` · vs. ${game.opponent}` : ""}
          </p>
        </DialogHeader>

        <Tabs defaultValue="disponibilidade" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-5 shrink-0 grid w-[calc(100%-2.5rem)] grid-cols-2">
            <TabsTrigger value="disponibilidade" className="gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Disponibilidade
              {availableRows.length > 0 && (
                <span className="ml-1 rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white leading-4">
                  {availableRows.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="convocados" className="gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Convocados
              {callups.length > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground leading-4">
                  {callups.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Disponibilidade ─────────────────────── */}
          <TabsContent value="disponibilidade" className="flex-1 overflow-y-auto px-5 pb-5 mt-3 space-y-4 data-[state=inactive]:hidden">

            {availLoading ? (
              <div className="space-y-2 pt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            ) : availability.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <HelpCircle className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhum jogador respondeu ainda.</p>
                <p className="text-xs opacity-70">
                  Os jogadores recebem o pedido de disponibilidade na área de jogador.
                </p>
              </div>
            ) : (
              <>
                {/* Resumo de contagens */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:border-green-800/50 dark:bg-green-950/30 dark:text-green-400">
                    <Check className="h-3 w-3" />
                    {availableRows.length} disponíve{availableRows.length !== 1 ? "is" : "l"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-400">
                    <X className="h-3 w-3" />
                    {unavailableRows.length} indisponíve{unavailableRows.length !== 1 ? "is" : "l"}
                  </span>
                  {pendingRows.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      <HelpCircle className="h-3 w-3" />
                      {pendingRows.length} sem resposta
                    </span>
                  )}
                </div>

                {/* Disponíveis */}
                {availableRows.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-green-700 dark:text-green-400">
                      Disponíveis — prontos a convocar
                    </p>
                    {availableRows.map((row) => {
                      const alreadyCalled = calledUpIds.has(row.player_id);
                      const isLoading = quickSaving === row.player_id;
                      return (
                        <div
                          key={row.player_id}
                          className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50/60 p-2.5 dark:border-green-800/40 dark:bg-green-950/20"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                            {row.jersey_number != null ? `#${row.jersey_number}` : row.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{row.name}</p>
                            {row.jersey_number != null && (
                              <p className="text-[11px] text-muted-foreground">#{row.jersey_number}</p>
                            )}
                          </div>
                          {alreadyCalled ? (
                            <Badge variant="outline" className="shrink-0 border-green-400 text-green-700 text-[11px] dark:text-green-400">
                              <Check className="mr-1 h-3 w-3" />
                              Convocado
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 h-7 gap-1 border-green-400 text-green-700 hover:bg-green-100 text-[12px] dark:text-green-400 dark:hover:bg-green-950/40"
                              disabled={isLoading}
                              onClick={() => quickConvoke(row.player_id)}
                            >
                              {isLoading
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <UserPlus className="h-3.5 w-3.5" />}
                              Convocar
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Indisponíveis */}
                {unavailableRows.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
                      Indisponíveis
                    </p>
                    {unavailableRows.map((row) => {
                      const reasonLabel =
                        row.reason_code === "outro" && row.reason_text
                          ? row.reason_text
                          : row.reason_code
                          ? (RSVP_REASON_LABELS[row.reason_code] ?? row.reason_code)
                          : null;
                      return (
                        <div
                          key={row.player_id}
                          className="flex items-center gap-3 rounded-lg border border-red-200/70 bg-red-50/40 p-2.5 dark:border-red-800/30 dark:bg-red-950/10"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100/80 text-[11px] font-bold text-red-500 dark:bg-red-900/30 dark:text-red-400">
                            {row.jersey_number != null ? `#${row.jersey_number}` : row.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-muted-foreground">{row.name}</p>
                          </div>
                          {reasonLabel && (
                            <Badge variant="outline" className="shrink-0 text-[11px] text-muted-foreground">
                              {reasonLabel}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Sem resposta */}
                {pendingRows.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Sem resposta
                    </p>
                    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {pendingRows.map((r) =>
                          r.jersey_number != null ? `${r.name} (#${r.jersey_number})` : r.name
                        ).join(" · ")}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── Tab: Convocados ───────────────────────────── */}
          <TabsContent value="convocados" className="flex flex-col flex-1 min-h-0 mt-3 data-[state=inactive]:hidden">
            <div className="flex-1 overflow-y-auto px-5 space-y-2">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))
                : callups.length === 0
                ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <Users className="h-8 w-8 opacity-30" />
                    <p className="text-sm">Ainda não há convocados para este jogo.</p>
                  </div>
                )
                : callups.map((c) => (
                  <div key={c.id} className="group flex items-center gap-3 rounded-lg border bg-card p-2.5">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={c.player.photo_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {c.player.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.player.name}</p>
                      {c.player.position && (
                        <p className="text-xs text-muted-foreground capitalize">{c.player.position}</p>
                      )}
                    </div>
                    {c.player.number != null && (
                      <span className="text-xs font-semibold text-muted-foreground shrink-0">
                        #{c.player.number}
                      </span>
                    )}
                    <button
                      onClick={() => removeCallup(c.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                      title="Remover convocado"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
            </div>

            {/* Adicionar convocado */}
            <div className="px-5 pb-5 pt-3 border-t mt-3 space-y-2">
              <div className="flex gap-2">
                <Select
                  value={selectedPlayerId}
                  onValueChange={setSelectedPlayerId}
                  disabled={rosterLoading}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={
                      dropdownPlayers.length === 0
                        ? "Todos os jogadores estão convocados"
                        : "Selecionar jogador..."
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {dropdownPlayers.map((p) => {
                      const avStatus = availabilityByPlayer.get(p.player_id ?? "") ?? "none";
                      const suffix =
                        avStatus === "available"   ? " · ✓ disponível"   :
                        avStatus === "unavailable" ? " · ✗ indisponível" :
                        availability.length > 0   ? " · sem resposta"   : "";
                      return (
                        <SelectItem key={p.player_id} value={p.player_id!}>
                          {p.name}{p.number != null ? ` (#${p.number})` : ""}{suffix}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={saving || !selectedPlayerId}
                  className="gap-1.5 shrink-0"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {saving ? "A convocar..." : "Adicionar"}
                </Button>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
