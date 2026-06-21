"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type { PaymentWithUser } from "@/types/database";

export function usePayments(seasonId: string | null) {
  const [payments, setPayments] = useState<PaymentWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = useCallback(async () => {
    if (!seasonId) { setPayments([]); setLoading(false); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("payments")
      .select("*, user:users(id, name, email)")
      .eq("season_id", seasonId)
      .order("reference_year", { ascending: false })
      .order("month", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar pagamentos", variant: "destructive" });
    } else {
      setPayments((data ?? []) as unknown as PaymentWithUser[]);
    }
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  async function markAsPaid(paymentId: string): Promise<boolean> {
    const { error } = await supabase
      .from("payments")
      .update({ status: "pago", paid_at: new Date().toISOString() })
      .eq("id", paymentId);

    if (error) {
      toast({ title: "Erro ao marcar pagamento", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Pagamento registado" });
    await load();
    return true;
  }

  const totalPago = payments
    .filter((p) => p.status === "pago")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const totalPendente = payments
    .filter((p) => p.status === "pendente")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return { payments, loading, markAsPaid, totalPago, totalPendente, refresh: load };
}
