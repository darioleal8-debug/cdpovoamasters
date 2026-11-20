"use client";

const REGULATION_PERIODS = 4;

function shortLabel(n: number): string {
  if (n <= REGULATION_PERIODS) return `P${n}`;
  return n - REGULATION_PERIODS === 1 ? "OT" : `OT${n - REGULATION_PERIODS}`;
}

interface PeriodBarProps {
  period: number;
  homeScore: number;
  awayScore: number;
  onNextPeriod: () => void;
  onFinish: () => void;
  disabled?: boolean;
  /** Versão curta para o ecrã móvel (landscape). */
  compact?: boolean;
}

/**
 * Períodos visíveis (P1 P2 P3 P4 OT), botão explícito de fim de período e
 * botão "Finish game" sempre disponível — em qualquer período e estado do relógio.
 */
export function PeriodBar({ period, homeScore, awayScore, onNextPeriod, onFinish, disabled, compact }: PeriodBarProps) {
  const tied = homeScore === awayScore;
  const pastRegulation = period >= REGULATION_PERIODS;
  // Depois do 4.º período sem empate, o passo seguinte é terminar (não há prolongamento).
  const finishOnly = pastRegulation && !tied;
  const next = period + 1;
  const nextLabel = shortLabel(next);

  const btn = (primary: boolean, danger = false): React.CSSProperties => ({
    height: compact ? 44 : 46,
    padding: compact ? "0 10px" : "0 16px",
    borderRadius: compact ? 8 : 10,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: compact ? 12 : 14,
    fontWeight: 800,
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    flexShrink: 0,
    border: danger ? "none" : primary ? "none" : "1px solid var(--line)",
    background: danger ? "oklch(0.55 0.2 25)" : primary ? "var(--accent)" : "var(--panel)",
    color: danger ? "white" : primary ? "var(--accentInk)" : "var(--text)",
    opacity: disabled ? 0.6 : 1,
  });

  const total = Math.max(REGULATION_PERIODS, period);
  const chips = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10, flexShrink: 0 }}>
      {!compact && (
        <div role="group" aria-label="Periods" style={{ display: "flex", gap: 4 }}>
          {chips.map((n) => {
            const current = n === period;
            return (
              <span
                key={n}
                aria-current={current ? "step" : undefined}
                style={{
                  minWidth: 34, height: 28, padding: "0 6px", borderRadius: 8,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800,
                  background: current ? "var(--accent)" : "transparent",
                  color: current ? "var(--accentInk)" : n < period ? "var(--muted)" : "var(--text)",
                  border: current ? "1px solid var(--accent)" : "1px solid var(--line)",
                  opacity: n < period ? 0.6 : 1,
                }}
              >
                {shortLabel(n)}
              </span>
            );
          })}
        </div>
      )}
      {!finishOnly && (
        <button type="button" onClick={onNextPeriod} disabled={disabled} style={btn(false)}
          title={`End period ${period} and go to ${nextLabel}`}>
          {compact ? `→ ${nextLabel}` : `End ${shortLabel(period)} → ${nextLabel}`}
        </button>
      )}
      <button type="button" onClick={onFinish} disabled={disabled} style={btn(finishOnly, !finishOnly)}
        title="Finish the game and confirm the final score">
        {compact ? "🏁" : "🏁 Finish game"}
      </button>
    </div>
  );
}
