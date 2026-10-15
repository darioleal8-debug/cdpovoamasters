"use client";

import { useEffect, useState } from "react";

export interface MyQuotaPayment {
  id:              string;
  month:           number;
  reference_year:  number;
  amount:          number;
  status:          "pago" | "pendente";
  paid_at:         string | null;
}

export interface MyQuotaSummary {
  total:   number;
  paid:    number;
  pending: number;
}

export function useMyQuota(seasonId: string | null) {
  const [payments, setPayments] = useState<MyQuotaPayment[]>([]);
  const [summary, setSummary]   = useState<MyQuotaSummary>({ total: 0, paid: 0, pending: 0 });
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!seasonId) {
      setPayments([]);
      setSummary({ total: 0, paid: 0, pending: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/my-quota?season_id=${seasonId}`)
      .then((r) => r.json())
      .then((d) => {
        setPayments(d.payments ?? []);
        setSummary(d.summary ?? { total: 0, paid: 0, pending: 0 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [seasonId]);

  return { payments, summary, loading };
}
