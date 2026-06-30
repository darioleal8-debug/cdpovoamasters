"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/components/ui/toaster";
import type {
  PlayerPaymentWithPlayer,
  PlayerPaymentSummary,
  PlayerPaymentStatus,
  PlayerPaymentMethod,
} from "@/types/database";

export interface UpsertPaymentData {
  season_id: string;
  player_id: string;
  month: number;
  reference_year: number;
  amount: number;
  amount_due?: number;
  status: PlayerPaymentStatus;
  method?: PlayerPaymentMethod | null;
  notes?: string | null;
  payment_date?: string | null;
}

export function usePlayerPayments(seasonId: string | null) {
  const [payments, setPayments]   = useState<PlayerPaymentWithPlayer[]>([]);
  const [summary,  setSummary]    = useState<PlayerPaymentSummary[]>([]);
  const [loading,  setLoading]    = useState(true);

  const loadPayments = useCallback(async () => {
    if (!seasonId) { setPayments([]); setSummary([]); setLoading(false); return; }
    setLoading(true);

    const [paymentsRes, summaryRes] = await Promise.all([
      fetch(`/api/player-payments?season_id=${seasonId}`),
      fetch(`/api/player-payments/summary?season_id=${seasonId}`),
    ]);

    const paymentsJson = await paymentsRes.json();
    const summaryJson  = await summaryRes.json();

    setPayments(paymentsJson.payments ?? []);
    setSummary(summaryJson.summary   ?? []);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  async function upsertPayment(data: UpsertPaymentData): Promise<boolean> {
    const res  = await fetch("/api/player-payments", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao registar pagamento", description: json.error, variant: "destructive" });
      return false;
    }
    toast({ title: "Pagamento registado com sucesso" });
    await loadPayments();
    return true;
  }

  async function updatePayment(id: string, data: Partial<UpsertPaymentData>): Promise<boolean> {
    const res  = await fetch(`/api/player-payments/${id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao atualizar pagamento", description: json.error, variant: "destructive" });
      return false;
    }
    toast({ title: "Pagamento atualizado" });
    await loadPayments();
    return true;
  }

  async function deletePayment(id: string): Promise<boolean> {
    const res = await fetch(`/api/player-payments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: "Erro ao eliminar pagamento", variant: "destructive" });
      return false;
    }
    toast({ title: "Pagamento eliminado" });
    await loadPayments();
    return true;
  }

  // ── Totais calculados no cliente ──────────────────────────
  const totalPaid    = summary.reduce((s, r) => s + Number(r.total_paid),    0);
  const totalDue     = summary.reduce((s, r) => s + Number(r.total_due),     0);
  const totalMissing = summary.reduce((s, r) => s + Number(r.total_missing), 0);
  const playersLate  = summary.filter((r) => r.months_late > 0).length;

  return {
    payments, summary, loading,
    totalPaid, totalDue, totalMissing, playersLate,
    upsertPayment, updatePayment, deletePayment, refresh: loadPayments,
  };
}
