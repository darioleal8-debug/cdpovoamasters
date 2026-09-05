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
  season_id:  string;
  player_id?: string | null;
  user_id?:   string | null;
  month: number;
  reference_year: number;
  amount: number;
  amount_due?: number;
  status: PlayerPaymentStatus;
  method?: PlayerPaymentMethod | null;
  notes?: string | null;
  payment_date?: string | null;
}

function receiptToast(
  action: "registado" | "atualizado",
  json: { receipt_sent?: boolean; receipt_note?: string; receipt_error?: string }
) {
  const { receipt_sent, receipt_note, receipt_error } = json;

  if (receipt_sent && receipt_note !== "already_sent") {
    toast({ title: `Pagamento ${action} e recibo enviado ao jogador.` });
    return;
  }

  const base = `Pagamento ${action}`;

  if (receipt_note === "sem_conta" || receipt_note === "sem_email") {
    toast({
      title:       base,
      description: "O jogador não tem email associado — recibo não enviado.",
    });
    return;
  }

  if (receipt_note === "already_sent") {
    toast({ title: base });
    return;
  }

  if (receipt_note === "resend_error" || receipt_note === "error") {
    toast({
      title:       `${base}, mas o recibo não foi enviado. O sistema tentará novamente.`,
      description: receipt_error ? `Erro: ${receipt_error}` : "Verifica os logs do servidor para mais detalhes.",
      variant:     "destructive",
    });
    return;
  }

  // dev fallback ou sem status de recibo (status != "paid")
  toast({ title: base });
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
    receiptToast("registado", json);
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
    receiptToast("atualizado", json);
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
