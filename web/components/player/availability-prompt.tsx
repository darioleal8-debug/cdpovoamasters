"use client";

import { useCallback, useState } from "react";
import { Check, HelpCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { RSVP_REASON_LABELS } from "@/types/database";
import type { RsvpReasonCode } from "@/types/database";
import type { AvailabilityRosterRow } from "@/types/availability";

type Answer = "yes" | "no";

interface Props {
  kind:           "game" | "training";
  eventId:        string;
  /** Instante (ISO) a partir do qual o jogador já não pode responder. */
  deadlineIso:    string;
  initialAnswer:  Answer | null;
  /** Só treinos: plantel com o estado de cada jogador, para mostrar quem vai. */
  initialRoster?: AvailabilityRosterRow[];
}

const REASONS = Object.entries(RSVP_REASON_LABELS) as [RsvpReasonCode, string][];

const COPY = {
  game: {
    yes: "Estou disponível", no: "Não posso",
    doneYes: "Disponível para o jogo", doneNo: "Indisponível para o jogo",
    confirmNo: "Confirmar indisponibilidade",
    closed: "O jogo já começou.",
  },
  training: {
    yes: "Vou", no: "Não vou",
    doneYes: "Vais ao treino", doneNo: "Não vais ao treino",
    confirmNo: "Confirmar falta",
    closed: "O treino já começou.",
  },
} as const;

function firstName(name: string) {
  return name.split(" ").filter(Boolean)[0] ?? name;
}

export function AvailabilityPrompt({
  kind, eventId, deadlineIso, initialAnswer, initialRoster,
}: Props) {
  const copy = COPY[kind];
  const [answer,     setAnswer]     = useState<Answer | null>(initialAnswer);
  const [roster,     setRoster]     = useState<AvailabilityRosterRow[] | null>(initialRoster ?? null);
  const [saving,     setSaving]     = useState<Answer | null>(null);
  const [showReason, setShowReason] = useState(false);
  const [reasonCode, setReasonCode] = useState<RsvpReasonCode | "">("");
  const [reasonText, setReasonText] = useState("");

  const closed = new Date() > new Date(deadlineIso);

  const reloadRoster = useCallback(async () => {
    if (kind !== "training") return;
    try {
      const res = await fetch(`/api/trainings/${eventId}/rsvp/roster`);
      if (res.ok) setRoster((await res.json()).players ?? []);
    } catch {
      // não-fatal: a lista fica como estava
    }
  }, [kind, eventId]);

  async function submit(next: Answer) {
    setSaving(next);
    const url = kind === "game"
      ? `/api/games/${eventId}/availability`
      : `/api/trainings/${eventId}/rsvp`;
    const status = kind === "game"
      ? (next === "yes" ? "available" : "unavailable")
      : (next === "yes" ? "going" : "not_going");

    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          status,
          reason_code: next === "no" ? (reasonCode || null) : null,
          reason_text: next === "no" ? (reasonText.trim() || null) : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Não foi possível guardar a tua resposta",
          description: json.error,
          variant: "destructive",
        });
        return;
      }
      setAnswer(next);
      setShowReason(false);
      setReasonCode("");
      setReasonText("");
      await reloadRoster();
    } catch {
      toast({
        title: "Sem ligação",
        description: "A tua resposta não foi guardada. Tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  const going    = (roster ?? []).filter((r) => r.status === "going");
  const notGoing = (roster ?? []).filter((r) => r.status === "not_going");
  const pending  = (roster ?? []).filter((r) => !r.status);

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        A tua disponibilidade
      </p>

      {/* ── Estado actual ── */}
      {answer && (
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm font-semibold",
            answer === "yes"
              ? "text-green-700 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {answer === "yes" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {answer === "yes" ? copy.doneYes : copy.doneNo}
        </p>
      )}

      {/* ── Botões ── */}
      {closed ? (
        <p className="text-xs italic text-muted-foreground">
          {copy.closed}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving !== null}
            aria-pressed={answer === "yes"}
            onClick={() => submit("yes")}
            className={cn(
              "min-h-[44px] gap-1.5",
              answer === "yes" &&
                "border-green-600 bg-green-600 text-white hover:bg-green-700 hover:text-white"
            )}
          >
            {saving === "yes"
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Check className="h-4 w-4" />}
            {copy.yes}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving !== null}
            aria-pressed={answer === "no"}
            aria-expanded={showReason}
            onClick={() => setShowReason((v) => !v)}
            className={cn(
              "min-h-[44px] gap-1.5",
              answer === "no" &&
                "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white"
            )}
          >
            <X className="h-4 w-4" />
            {copy.no}
          </Button>
        </div>
      )}

      {/* ── Motivo (opcional) ── */}
      {showReason && !closed && (
        <div className="space-y-2.5 rounded-lg border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">Motivo (opcional)</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map(([code, label]) => (
              <button
                key={code}
                type="button"
                aria-pressed={reasonCode === code}
                onClick={() => setReasonCode((prev) => (prev === code ? "" : code))}
                className={cn(
                  "min-h-[36px] rounded-full border px-3 text-xs transition-colors",
                  reasonCode === code
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                )}
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
              aria-label="Motivo"
              className="w-full rounded-md border bg-background px-2.5 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring md:text-xs"
            />
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={saving !== null}
              onClick={() => submit("no")}
              className="min-h-[44px] gap-1.5 px-3 text-xs"
            >
              {saving === "no"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <X className="h-3.5 w-3.5" />}
              {copy.confirmNo}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving !== null}
              onClick={() => setShowReason(false)}
              className="min-h-[44px] px-3 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Quem vai (só treinos) ── */}
      {kind === "training" && roster && roster.length > 0 && (
        <div className="space-y-1.5 border-t pt-3 text-xs">
          <p className="flex items-start gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-400" />
            <span>
              <span className="font-semibold">Vão ({going.length})</span>
              {going.length > 0 && (
                <span className="text-muted-foreground">
                  {" · "}{going.map((r) => firstName(r.name)).join(", ")}
                </span>
              )}
            </span>
          </p>
          {notGoing.length > 0 && (
            <p className="flex items-start gap-1.5">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
              <span>
                <span className="font-semibold">Não vão ({notGoing.length})</span>
                <span className="text-muted-foreground">
                  {" · "}{notGoing.map((r) => firstName(r.name)).join(", ")}
                </span>
              </span>
            </p>
          )}
          {pending.length > 0 && (
            <p className="flex items-start gap-1.5 text-muted-foreground">
              <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Sem resposta ({pending.length})</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
