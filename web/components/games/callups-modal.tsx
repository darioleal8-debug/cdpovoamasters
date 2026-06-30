"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserMinus, UserPlus, Users } from "lucide-react";
import { useGameCallups } from "@/hooks/use-game-callups";
import { useRoster } from "@/hooks/use-roster";
import { formatDateShort } from "@/lib/utils";
import type { Event } from "@/types/database";

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

  const calledUpIds = useMemo(() => new Set(callups.map((c) => c.player_id)), [callups]);
  const available = useMemo(
    () => roster.filter((p) => !calledUpIds.has(p.id)),
    [roster, calledUpIds]
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
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Convocados — {game.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {formatDateShort(game.event_date)} · {game.event_time.slice(0, 5)}h
            {game.opponent ? ` · vs. ${game.opponent}` : ""}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))
            : callups.length === 0
            ? <p className="py-6 text-center text-sm text-muted-foreground">
                Ainda não há jogadores convocados para este jogo.
              </p>
            : callups.map((c) => (
                <div key={c.id} className="group flex items-center gap-3 rounded-lg border bg-card p-2.5">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={c.player.photo_url ?? undefined} />
                    <AvatarFallback className="text-xs">{c.player.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.player.name}</p>
                    {c.player.position && (
                      <p className="text-xs text-muted-foreground capitalize">{c.player.position}</p>
                    )}
                  </div>
                  {c.player.number != null && (
                    <span className="text-xs font-semibold text-muted-foreground">#{c.player.number}</span>
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

        <div className="border-t pt-3 space-y-2">
          <div className="flex gap-2">
            <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId} disabled={rosterLoading}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={available.length === 0 ? "Sem jogadores disponíveis" : "Selecionar jogador..."} />
              </SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.number != null ? ` (#${p.number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAdd} disabled={saving || !selectedPlayerId} className="gap-1.5 shrink-0">
              <UserPlus className="h-3.5 w-3.5" />
              {saving ? "A convocar..." : "Adicionar"}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
