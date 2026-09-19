"use client";

import { useState } from "react";
import { Check, X, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRsvp } from "@/hooks/use-rsvp";
import type { RsvpReasonCode } from "@/types/database";
import { RSVP_REASON_LABELS } from "@/types/database";

interface Props {
  trainingId:    string;
  deadlineIso:   string;
  initialStatus?: "going" | "not_going" | null;
}

const REASONS = Object.entries(RSVP_REASON_LABELS) as [RsvpReasonCode, string][];

export function RsvpButtons({ trainingId, deadlineIso, initialStatus = null }: Props) {
  const { own, loading, respond } = useRsvp(trainingId);
  const [saving,       setSaving]       = useState(false);
  const [showReason,   setShowReason]   = useState(false);
  const [reasonCode,   setReasonCode]   = useState<RsvpReasonCode | "">("");
  const [reasonText,   setReasonText]   = useState("");

  const isDeadlinePast = new Date() > new Date(deadlineIso);

  // Estado actual (usa o valor em tempo real do hook, com fallback para prop inicial)
  const currentStatus = own?.status ?? initialStatus;

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>A carregar…</span>
      </div>
    );
  }

  if (isDeadlinePast && !currentStatus) {
    return (
      <p className="text-xs text-muted-foreground/70 italic">
        Prazo de confirmação encerrado.
      </p>
    );
  }

  // Já confirmou — mostrar badge + opção de alterar (se ainda no prazo)
  if (currentStatus && isDeadlinePast) {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge status={currentStatus} />
        <span className="text-[11px] text-muted-foreground/60">(prazo encerrado)</span>
      </div>
    );
  }

  async function handleGoing() {
    setSaving(true);
    setShowReason(false);
    await respond("going", null, null);
    setSaving(false);
  }

  async function handleNotGoing() {
    if (!showReason) {
      setShowReason(true);
      return;
    }
    setSaving(true);
    await respond(
      "not_going",
      reasonCode || null,
      reasonText.trim() || null
    );
    setSaving(false);
    setShowReason(false);
    setReasonCode("");
    setReasonText("");
  }

  function cancelReason() {
    setShowReason(false);
    setReasonCode("");
    setReasonText("");
  }

  return (
    <div className="space-y-2">
      {/* Estado actual + botões */}
      <div className="flex items-center gap-2 flex-wrap">
        {currentStatus && <StatusBadge status={currentStatus} />}
        {currentStatus && !isDeadlinePast && (
          <span className="text-[11px] text-muted-foreground/70">· Alterar:</span>
        )}

        <Button
          size="sm"
          variant={currentStatus === "going" ? "default" : "outline"}
          disabled={saving || currentStatus === "going"}
          onClick={handleGoing}
          className="h-7 px-3 gap-1.5 text-xs"
        >
          {saving && !showReason
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Check className="h-3.5 w-3.5" />}
          Vou
        </Button>

        <Button
          size="sm"
          variant={currentStatus === "not_going" && !showReason ? "destructive" : "outline"}
          disabled={saving}
          onClick={showReason ? handleNotGoing : () => setShowReason(true)}
          className="h-7 px-3 gap-1.5 text-xs"
        >
          {saving && showReason
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <X className="h-3.5 w-3.5" />}
          Não vou
          {!showReason && <ChevronDown className="h-3 w-3 ml-0.5" />}
        </Button>
      </div>

      {/* Painel de motivo */}
      {showReason && (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2.5 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Motivo (opcional)</p>

          <div className="flex flex-wrap gap-1.5">
            {REASONS.map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setReasonCode((prev) => (prev === code ? "" : code))}
                className={[
                  "px-2.5 py-1 rounded-full text-xs border transition-colors",
                  reasonCode === code
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          {reasonCode === "outro" && (
            <input
              type="text"
              maxLength={140}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Descreve brevemente (opcional)"
              className="w-full text-xs rounded-md border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}

          <div className="flex gap-2 pt-0.5">
            <Button
              size="sm"
              variant="destructive"
              disabled={saving}
              onClick={handleNotGoing}
              className="h-7 px-3 text-xs gap-1"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Confirmar falta
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelReason}
              className="h-7 px-3 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "going" | "not_going" }) {
  return status === "going" ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
      <Check className="h-3.5 w-3.5" /> Confirmado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
      <X className="h-3.5 w-3.5" /> Não vai
    </span>
  );
}
