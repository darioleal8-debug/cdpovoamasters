"use client";

import { useState } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { usePayments } from "@/hooks/use-payments";
import { PaymentsTable } from "@/components/payments/payments-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PaymentWithUser } from "@/types/database";

export default function PagamentosPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { payments, loading, markAsPaid, totalPago, totalPendente } = usePayments(seasonId);

  async function handleMarkPaid(payment: PaymentWithUser) {
    await markAsPaid(payment.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
          <p className="text-muted-foreground">Gestão de quotas mensais dos jogadores</p>
        </div>
        <Select value={seasonId ?? ""} onValueChange={setSelectedSeasonId} disabled={seasonsLoading}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Selecionar temporada" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.status === "ativa" ? "✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo financeiro */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-t-4 border-t-green-500">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Recebido</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{formatCurrency(totalPago)}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-red-500">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Pendente</p>
            <p className="mt-1 text-2xl font-bold text-destructive">{formatCurrency(totalPendente)}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-cdpovoa-blue">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Geral</p>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(totalPago + totalPendente)}</p>
          </CardContent>
        </Card>
      </div>

      <PaymentsTable
        payments={payments}
        loading={loading}
        onMarkPaid={handleMarkPaid}
      />
    </div>
  );
}
