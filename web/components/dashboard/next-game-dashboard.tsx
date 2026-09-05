"use client";

import Link from "next/link";

interface NextGameData {
  id:           string;
  title:        string;
  opponent:     string | null;
  event_date:   string;
  event_time:   string | null;
  location:     string | null;
  competition:  string | null;
  days_until:   number;
  callup_count: number;
  roster_size:  number;
}

interface Props {
  game: NextGameData | null;
  loading?: boolean;
}

function fmtDate(d: string, t?: string | null): string {
  const day = new Date(d + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long",
  });
  const cap = day.charAt(0).toUpperCase() + day.slice(1);
  return t ? `${cap} · ${t.slice(0, 5).replace(":", "h")}` : cap;
}

export function NextGameDashboard({ game, loading }: Props) {
  if (loading) {
    return (
      <section
        aria-label="Próximo jogo"
        className="rounded-2xl p-8 flex flex-col gap-6 animate-pulse"
        style={{ background: "var(--ink, #0A1220)" }}
      >
        <div className="h-3 w-32 rounded-full bg-white/10" />
        <div className="h-12 w-4/5 rounded-lg bg-white/10" />
        <div className="h-4 w-48 rounded-full bg-white/10" />
        <div className="flex gap-3">
          <div className="h-9 w-40 rounded-xl bg-white/10" />
          <div className="h-9 w-28 rounded-xl bg-white/10" />
        </div>
      </section>
    );
  }

  if (!game) {
    return (
      <section
        aria-label="Próximo jogo"
        className="rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center"
        style={{ background: "var(--ink, #0A1220)", minHeight: 240 }}
      >
        <p className="font-condensed text-2xl font-bold text-white/40 tracking-display uppercase">
          Sem jogos agendados
        </p>
        <p className="text-sm text-white/30">
          Importa o calendário em Configurações para começar.
        </p>
        <Link
          href="/configuracoes/importar"
          className="mt-2 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          style={{ background: "rgba(249,115,22,.12)", color: "var(--action, #F97316)" }}
        >
          Importar calendário
        </Link>
      </section>
    );
  }

  const callupPct  = game.roster_size > 0 ? game.callup_count / game.roster_size : 0;
  const daysLabel  = game.days_until === 0 ? "Hoje"
    : game.days_until === 1 ? "Amanhã"
    : `${game.days_until} dias`;

  // Divide o título em clube vs oponente para tipografia grande
  const titleStr = game.title ?? "";
  const parts = titleStr.split(/\s+vs\.?\s+/i);
  const home  = parts[0]?.trim() || titleStr;
  const away  = parts[1]?.trim() ?? game.opponent ?? "";

  return (
    <section
      aria-label="Próximo jogo"
      className="rounded-2xl p-5 md:p-8 flex flex-col justify-between gap-6 md:gap-8 relative overflow-hidden"
      style={{ background: "var(--ink, #0A1220)", minHeight: 300 }}
    >
      {/* Textura sutil */}
      <svg aria-hidden="true" className="absolute inset-0 pointer-events-none opacity-[.04] h-full w-full">
        <defs>
          <pattern id="ng-diag" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="32" stroke="#F97316" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ng-diag)" />
      </svg>

      {/* Cabeçalho */}
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2.5">
            <span
              className="text-[10px] font-bold uppercase tracking-label px-2.5 py-1 rounded-full"
              style={{ background: "rgba(249,115,22,.15)", color: "var(--action, #F97316)" }}
            >
              Próximo jogo
            </span>
            {game.competition && (
              <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>
                {game.competition}
              </span>
            )}
          </div>
          {/* Contagem de dias */}
          <div className="text-right shrink-0">
            <p className="font-condensed font-bold text-4xl leading-none" style={{ color: "var(--highlight, #F59E0B)" }}>
              {game.days_until <= 0 ? "Hoje" : game.days_until}
            </p>
            {game.days_until > 0 && (
              <p className="text-[10px] uppercase tracking-label" style={{ color: "rgba(255,255,255,.35)" }}>
                {game.days_until === 1 ? "dia" : "dias"}
              </p>
            )}
          </div>
        </div>

        {/* Confronto tipográfico */}
        <div className="flex items-baseline gap-3 mb-4">
          <span className="font-condensed font-bold text-white leading-none" style={{ fontSize: "clamp(28px,3vw,44px)" }}>
            {home}
          </span>
          <span className="font-condensed font-bold leading-none" style={{ fontSize: "clamp(18px,2vw,26px)", color: "rgba(255,255,255,.35)" }}>
            vs
          </span>
          <span className="font-condensed font-bold text-white leading-none" style={{ fontSize: "clamp(28px,3vw,44px)" }}>
            {away}
          </span>
        </div>

        {/* Data e local */}
        <p className="text-sm capitalize mb-1" style={{ color: "rgba(255,255,255,.55)" }}>
          {fmtDate(game.event_date, game.event_time)}
        </p>
        {game.location && (
          <p className="text-[13px]" style={{ color: "rgba(255,255,255,.35)" }}>
            {game.location}
          </p>
        )}
      </div>

      {/* Convocados + barra de progresso */}
      {game.roster_size > 0 && (
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,.6)" }}>
              {game.callup_count} de {game.roster_size} convocados
            </span>
            <span className="text-[13px] font-semibold" style={{ color: callupPct === 1 ? "var(--ok, #12855B)" : "rgba(255,255,255,.5)" }}>
              {Math.round(callupPct * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full" style={{ background: "rgba(255,255,255,.1)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${callupPct * 100}%`,
                background: callupPct === 1 ? "var(--ok, #12855B)" : "var(--action, #F97316)",
              }}
            />
          </div>
        </div>
      )}

      {/* Ações — full-width em mobile, auto em tablet+ */}
      <div className="relative z-10 flex flex-col md:flex-row gap-2.5 md:gap-3">
        <Link
          href={`/jogos/${game.id}/live`}
          className="flex items-center justify-center h-11 md:h-10 rounded-xl px-5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--action, #F97316)", color: "#ffffff", touchAction: "manipulation" }}
        >
          Fechar convocatória
        </Link>
        <Link
          href={`/jogos/${game.id}/stats`}
          className="flex items-center justify-center h-11 md:h-10 rounded-xl border px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          style={{ borderColor: "rgba(255,255,255,.2)", touchAction: "manipulation" }}
        >
          Ver jogo
        </Link>
      </div>
    </section>
  );
}
