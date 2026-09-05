"use client";

import type { CardType } from "@/types/database";

interface CardMessageProps {
  cardType: CardType;
  cardData: Record<string, unknown>;
  isMine: boolean;
}

// ── Callup response ───────────────────────────────────────────
function CallupResponseCard({ data }: { data: Record<string, unknown> }) {
  const response = data.response as string;
  const playerName = data.player_name as string;
  const note = data.note as string | undefined;

  const conf = {
    confirmed:   { label: "Confirmado",   color: "var(--ok, #12855B)",   bg: "rgba(18,133,91,.12)"  },
    doubt:       { label: "Dúvida",       color: "var(--warn, #F59E0B)",  bg: "rgba(245,158,11,.12)" },
    unavailable: { label: "Indisponível", color: "var(--bad, #D92D20)",  bg: "rgba(217,45,32,.12)"  },
  }[response] ?? { label: response, color: "#A9B4C7", bg: "rgba(255,255,255,.06)" };

  return (
    <div className="rounded-xl p-3" style={{ background: conf.bg, border: `1px solid ${conf.color}33` }}>
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: conf.color }} />
        <p className="text-[13px] font-semibold" style={{ color: "#E6EBF3" }}>
          {playerName} · <span style={{ color: conf.color }}>{conf.label}</span>
        </p>
      </div>
      {note && (
        <p className="mt-1 text-[12px] pl-4" style={{ color: "#A9B4C7" }}>"{note}"</p>
      )}
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest pl-4" style={{ color: conf.color }}>
        Resposta à convocatória · atualizado no painel
      </p>
    </div>
  );
}

// ── Poll ──────────────────────────────────────────────────────
function PollCard({ data }: { data: Record<string, unknown> }) {
  const question = data.question as string;
  const options = data.options as Array<{ id: string; label: string }>;
  const votes = (data.votes ?? {}) as Record<string, string[]>;

  const totalVotes = Object.values(votes).flat().length;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(169,180,199,.15)" }}>
      <div className="px-3.5 py-2.5" style={{ background: "rgba(169,180,199,.06)" }}>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "#A9B4C7" }}>Sondagem</p>
        <p className="text-[14px] font-semibold" style={{ color: "#E6EBF3" }}>{question}</p>
      </div>
      <div className="px-3.5 py-2 flex flex-col gap-1.5">
        {options.map((opt) => {
          const count = (votes[opt.id] ?? []).length;
          const pct = totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0;
          return (
            <div key={opt.id}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[13px]" style={{ color: "#E6EBF3" }}>{opt.label}</span>
                <span className="text-[12px]" style={{ color: "#A9B4C7" }}>{count} · {pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full" style={{ background: "rgba(169,180,199,.1)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: "var(--action, #F97316)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Quota reminder ────────────────────────────────────────────
function QuotaReminderCard({ data }: { data: Record<string, unknown> }) {
  const lateCount = data.late_count as number;
  const totalOwed = data.total_owed as number;

  return (
    <div className="rounded-xl p-3.5" style={{ background: "rgba(217,45,32,.08)", border: "1px solid rgba(217,45,32,.2)" }}>
      <div className="flex items-start gap-2.5">
        <div className="h-2 w-2 mt-1.5 rounded-full shrink-0" style={{ background: "var(--bad, #D92D20)" }} />
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "#E6EBF3" }}>
            Lembrete de quotas
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: "#A9B4C7" }}>
            {lateCount} {lateCount === 1 ? "jogador" : "jogadores"} em atraso ·{" "}
            {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(totalOwed)} por cobrar
          </p>
          <p className="text-[10px] mt-1.5 font-semibold uppercase tracking-widest" style={{ color: "rgba(217,45,32,.7)" }}>
            Só visível para a equipa técnica
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Transport ─────────────────────────────────────────────────
function TransportCard({ data }: { data: Record<string, unknown> }) {
  const driverName    = data.driver_name as string;
  const seatsTotal    = data.seats_total as number;
  const passengers    = (data.passengers ?? []) as Array<{ name: string }>;
  const pickupLocation = data.pickup_location as string | undefined;
  const available     = seatsTotal - passengers.length;

  return (
    <div className="rounded-xl p-3.5" style={{ border: "1px solid rgba(169,180,199,.15)", background: "rgba(169,180,199,.04)" }}>
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#A9B4C7" }}>Transporte</p>
      <p className="text-[13px] font-semibold mb-1" style={{ color: "#E6EBF3" }}>
        {driverName} · {seatsTotal} {seatsTotal === 1 ? "lugar" : "lugares"}
      </p>
      {pickupLocation && (
        <p className="text-[12px] mb-2" style={{ color: "#A9B4C7" }}>📍 {pickupLocation}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {passengers.map((p, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(169,180,199,.1)", color: "#E6EBF3" }}>
            {p.name}
          </span>
        ))}
        {available > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(249,115,22,.1)", color: "var(--action, #F97316)" }}>
            +{available} {available === 1 ? "lugar livre" : "lugares livres"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Attendance ────────────────────────────────────────────────
function AttendanceCard({ data }: { data: Record<string, unknown> }) {
  const confirmed = data.confirmed_count as number;
  const absent    = data.absent_count as number;
  const total     = confirmed + absent;

  return (
    <div className="rounded-xl p-3.5" style={{ border: "1px solid rgba(169,180,199,.15)", background: "rgba(169,180,199,.04)" }}>
      <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#A9B4C7" }}>Registo de Presenças</p>
      <div className="flex gap-4">
        <div className="text-center">
          <p className="font-condensed font-bold text-2xl leading-none" style={{ color: "var(--ok, #12855B)" }}>{confirmed}</p>
          <p className="text-[11px]" style={{ color: "#A9B4C7" }}>presentes</p>
        </div>
        <div className="text-center">
          <p className="font-condensed font-bold text-2xl leading-none" style={{ color: "var(--bad, #D92D20)" }}>{absent}</p>
          <p className="text-[11px]" style={{ color: "#A9B4C7" }}>ausentes</p>
        </div>
        {total > 0 && (
          <div className="text-center">
            <p className="font-condensed font-bold text-2xl leading-none" style={{ color: "#E6EBF3" }}>
              {Math.round(confirmed / total * 100)}%
            </p>
            <p className="text-[11px]" style={{ color: "#A9B4C7" }}>presença</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main renderer ─────────────────────────────────────────────
export function CardMessage({ cardType, cardData, isMine }: CardMessageProps) {
  switch (cardType) {
    case "callup_response":
      return <CallupResponseCard data={cardData} />;
    case "poll":
      return <PollCard data={cardData} />;
    case "quota_reminder":
      return <QuotaReminderCard data={cardData} />;
    case "transport":
      return <TransportCard data={cardData} />;
    case "attendance":
      return <AttendanceCard data={cardData} />;
    default:
      return (
        <div className="rounded-xl p-3 text-[12px]" style={{ border: "1px solid rgba(169,180,199,.15)", color: "#A9B4C7" }}>
          Cartão não reconhecido: {cardType}
        </div>
      );
  }
}
