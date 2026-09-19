"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Check, X, HelpCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { RSVP_REASON_LABELS } from "@/types/database";
import type { TrainingRsvpPlayerRow, RsvpStatus, RsvpReasonCode } from "@/types/database";

interface Props {
  trainingId: string;
}

const STATUS_CONFIG: Record<RsvpStatus, { label: string; icon: typeof Check; cls: string }> = {
  going:     { label: "Vai",      icon: Check,  cls: "text-green-700 dark:text-green-400" },
  not_going: { label: "Não vai",  icon: X,      cls: "text-red-600 dark:text-red-400"   },
};

export function RsvpPlayerList({ trainingId }: Props) {
  const [rows,     setRows]     = useState<TrainingRsvpPlayerRow[]>([]);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/trainings/${trainingId}/rsvp/players`);
    const json = await res.json();
    if (res.ok) {
      setRows(json.players ?? []);
      setDeadline(json.deadline ?? null);
    }
    setLoading(false);
  }, [trainingId]);

  useEffect(() => { load(); }, [load]);

  async function setPlayerRsvp(playerId: string, status: RsvpStatus | null) {
    setSaving(playerId);
    const res = await fetch(`/api/trainings/${trainingId}/rsvp/players`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ player_id: playerId, status }),
    });
    const json = await res.json();
    setSaving(null);
    if (!res.ok) {
      toast({ title: "Erro", description: json.error, variant: "destructive" });
      return;
    }
    await load();
  }

  const goingRows    = rows.filter((r) => r.status === "going");
  const notGoingRows = rows.filter((r) => r.status === "not_going");
  const pendingRows  = rows.filter((r) => !r.status);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">A carregar…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Sem jogadores nesta temporada.</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      {deadline && (
        <p className="text-xs text-muted-foreground">
          Prazo: {new Date(deadline).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}
        </p>
      )}

      {/* Confirmados */}
      {goingRows.length > 0 && (
        <Section
          title={`Vão (${goingRows.length})`}
          icon={<Check className="h-3.5 w-3.5 text-green-600" />}
        >
          {goingRows.map((r) => (
            <PlayerRow key={r.player_id} row={r} saving={saving}
              onReset={() => setPlayerRsvp(r.player_id, null)}
              onSetNotGoing={() => setPlayerRsvp(r.player_id, "not_going")}
            />
          ))}
        </Section>
      )}

      {/* Não vão */}
      {notGoingRows.length > 0 && (
        <Section
          title={`Não vão (${notGoingRows.length})`}
          icon={<X className="h-3.5 w-3.5 text-red-500" />}
        >
          {notGoingRows.map((r) => (
            <PlayerRow key={r.player_id} row={r} saving={saving}
              onReset={() => setPlayerRsvp(r.player_id, null)}
              onSetGoing={() => setPlayerRsvp(r.player_id, "going")}
            />
          ))}
        </Section>
      )}

      {/* Sem resposta */}
      {pendingRows.length > 0 && (
        <Section
          title={`Sem resposta (${pendingRows.length})`}
          icon={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />}
        >
          {pendingRows.map((r) => (
            <PlayerRow key={r.player_id} row={r} saving={saving}
              onSetGoing={() => setPlayerRsvp(r.player_id, "going")}
              onSetNotGoing={() => setPlayerRsvp(r.player_id, "not_going")}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        {title}
      </div>
      <div className="divide-y rounded-lg border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function PlayerRow({
  row, saving, onReset, onSetGoing, onSetNotGoing,
}: {
  row: TrainingRsvpPlayerRow;
  saving: string | null;
  onReset?: () => void;
  onSetGoing?: () => void;
  onSetNotGoing?: () => void;
}) {
  const isSaving = saving === row.player_id;
  const cfg = row.status ? STATUS_CONFIG[row.status as RsvpStatus] : null;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {row.jersey_number != null && (
          <span className="shrink-0 w-7 text-center text-xs font-bold text-muted-foreground">
            #{row.jersey_number}
          </span>
        )}
        <div className="min-w-0">
          <span className={cn("text-sm font-medium truncate block", cfg?.cls)}>
            {row.name}
          </span>
          {row.status === "not_going" && row.reason_code && (
            <span className="text-[11px] text-muted-foreground">
              {RSVP_REASON_LABELS[row.reason_code as RsvpReasonCode]}
              {row.reason_text ? ` — ${row.reason_text}` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            {onSetGoing && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Marcar como 'Vai'"
                onClick={onSetGoing}>
                <Check className="h-3.5 w-3.5 text-green-600" />
              </Button>
            )}
            {onSetNotGoing && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Marcar como 'Não vai'"
                onClick={onSetNotGoing}>
                <X className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}
            {onReset && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Remover resposta"
                onClick={onReset}>
                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
