"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/components/ui/toaster";
import type { TrainingRsvpSummary, RsvpStatus, RsvpReasonCode } from "@/types/database";

export interface OwnRsvp {
  status: RsvpStatus;
  reason_code: RsvpReasonCode | null;
  reason_text: string | null;
  responded_at: string;
}

interface UseRsvpResult {
  summary:   TrainingRsvpSummary | null;
  own:       OwnRsvp | null;
  loading:   boolean;
  respond:   (status: RsvpStatus, reason_code?: RsvpReasonCode | null, reason_text?: string | null) => Promise<boolean>;
  refresh:   () => Promise<void>;
}

export function useRsvp(trainingId: string | null): UseRsvpResult {
  const [summary, setSummary] = useState<TrainingRsvpSummary | null>(null);
  const [own,     setOwn]     = useState<OwnRsvp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!trainingId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/trainings/${trainingId}/rsvp`);
      const json = await res.json();
      if (res.ok) {
        setSummary(json.summary ?? null);
        setOwn(json.own ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [trainingId]);

  useEffect(() => { load(); }, [load]);

  async function respond(
    status: RsvpStatus,
    reason_code: RsvpReasonCode | null = null,
    reason_text: string | null = null
  ): Promise<boolean> {
    if (!trainingId) return false;
    const res = await fetch(`/api/trainings/${trainingId}/rsvp`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status, reason_code, reason_text }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao registar confirmação", description: json.error, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  }

  return { summary, own, loading, respond, refresh: load };
}
