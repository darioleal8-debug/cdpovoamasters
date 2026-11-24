"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChargeModal } from "@/components/payments/charge-modal";
import { usePlayerCharges } from "@/hooks/use-player-charges";
import { chargeSummary, type PaymentType, type PlayerCharge } from "@/lib/payments/types";
import { formatCurrencyEUR, statusBadgeClass, statusLabel } from "@/lib/payment-utils";
import type { RosterEntry } from "@/types/database";

interface Props {
  type: PaymentType;
  seasonId: string | null;
  players: RosterEntry[];
  playersLoading: boolean;
}

/** Pagamentos de um tipo "uma vez por época" (ex.: Inscrição anual): uma linha por jogador. */
export function ChargesView({ type, seasonId, players, playersLoading }: Props) {
  const { charges, loading, saveCharge, deleteCharge } = usePlayerCharges(seasonId, type.id);
  const [editing, setEditing] = useState<{ player: RosterEntry; charge: PlayerCharge | null } | null>(null);

  const byPlayer = useMemo(() => new Map(charges.map((c) => [c.player_id, c])), [charges]);
  const ids = useMemo(() => players.map((p) => p.player_id).filter((x): x is string => !!x), [players]);
  const sum = useMemo(() => chargeSummary(charges, ids), [charges, ids]);
  // Jogadores sem perfil nesta época ainda não têm registo: contam como "por registar"
  const pending = sum.pending + (players.length - ids.length);

  const busy = loading || playersLoading;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          ["Recebido", formatCurrencyEUR(sum.paid)],
          ["Previsto", formatCurrencyEUR(sum.due)],
          ["Em falta", formatCurrencyEUR(sum.missing)],
          ["Por regularizar", String(pending)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{busy ? "…" : value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white divide-y">
        {!busy && players.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Sem jogadores neste clube.</p>
        )}
        {players.map((p) => {
          const c = p.player_id ? byPlayer.get(p.player_id) ?? null : null;
          return (
            <div key={p.user_id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.number ? `#${p.number} ` : ""}{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c
                    ? c.status === "exempt"
                      ? "Isento"
                      : `${formatCurrencyEUR(c.amount)} de ${formatCurrencyEUR(c.amount_due)}`
                    : "Por registar"}
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c ? statusBadgeClass(c.status) : "bg-muted text-muted-foreground border-transparent"}`}>
                {c ? statusLabel(c.status) : "—"}
              </span>
              <Button size="sm" variant={c ? "outline" : "default"} className="gap-1.5 h-8"
                onClick={() => setEditing({ player: p, charge: c })}>
                {c ? <><Pencil className="h-3.5 w-3.5" />Editar</> : <><Plus className="h-3.5 w-3.5" />Registar</>}
              </Button>
            </div>
          );
        })}
      </div>

      <ChargeModal
        open={!!editing}
        onClose={() => setEditing(null)}
        type={type}
        seasonId={seasonId}
        player={editing?.player ?? null}
        existing={editing?.charge ?? null}
        onSave={saveCharge}
        onDelete={deleteCharge}
      />
    </div>
  );
}
