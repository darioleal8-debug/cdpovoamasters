"use client";

import { formatCurrencyEUR } from "@/lib/payment-utils";

export interface IndicatorValues {
  recebido:        number;
  previsto:        number;
  emFalta:         number;
  taxaPct:         number | null;
  jogadoresAtraso: number;
  quotasAtraso:    number;
  atrasoMedioDias: number | null;
  piorMes:         string | null;
}

interface Props {
  values: IndicatorValues;
  loading?: boolean;
}

export function PaymentsIndicators({ values, loading }: Props) {
  const {
    recebido, previsto, emFalta, taxaPct,
    jogadoresAtraso, quotasAtraso, atrasoMedioDias, piorMes,
  } = values;

  const nenhum = previsto === 0 && recebido === 0;

  return (
    <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4 rounded-lg border bg-card text-card-foreground overflow-hidden">
      {/* Recebido */}
      <Cell loading={loading}>
        <Label>Recebido até hoje</Label>
        <Main>{nenhum ? "—" : formatCurrencyEUR(recebido)}</Main>
        <Sub>{nenhum ? "sem dados" : `de ${formatCurrencyEUR(previsto)} previstos`}</Sub>
      </Cell>

      {/* Em falta */}
      <Cell loading={loading}>
        <Label>Em falta</Label>
        <Main className={emFalta > 0 ? "text-red-600" : ""}>
          {nenhum ? "—" : formatCurrencyEUR(emFalta)}
        </Main>
        <Sub>
          {nenhum
            ? "sem dados"
            : jogadoresAtraso > 0
              ? `${jogadoresAtraso} jogador${jogadoresAtraso !== 1 ? "es" : ""} · ${quotasAtraso} quota${quotasAtraso !== 1 ? "s" : ""}`
              : "tudo em dia"}
        </Sub>
      </Cell>

      {/* Taxa */}
      <Cell loading={loading}>
        <Label>Taxa de cumprimento</Label>
        <Main>{taxaPct != null ? `${taxaPct}%` : "—"}</Main>
        {taxaPct != null && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${taxaPct}%`,
                background: taxaPct >= 80 ? "#12855B" : taxaPct >= 50 ? "#DC9A1C" : "#D92D20",
              }}
            />
          </div>
        )}
      </Cell>

      {/* Atraso médio */}
      <Cell loading={loading}>
        <Label>Atraso médio</Label>
        <Main>
          {atrasoMedioDias != null
            ? new Intl.NumberFormat("pt-PT").format(Math.round(atrasoMedioDias)) + " dias"
            : "—"}
        </Main>
        <Sub>{piorMes ? `pior mês: ${piorMes}` : " "}</Sub>
      </Cell>
    </div>
  );
}

function Cell({ children, loading }: { children: React.ReactNode; loading?: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1.5 px-5 py-4">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        <div className="h-6 w-32 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
      </div>
    );
  }
  return <div className="flex flex-col gap-0.5 px-5 py-4">{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

function Main({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xl font-bold tabular-nums leading-tight ${className ?? ""}`}>{children}</p>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
