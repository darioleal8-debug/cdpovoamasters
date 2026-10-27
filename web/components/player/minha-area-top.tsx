"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/toaster";
import { usePlayerPending } from "./player-pending-context";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Answer = "yes" | "no";

export type TrainingData = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  type: string | null;
};

export type GameData = {
  id: string;
  event_date: string;
  event_time: string | null;
  location: string | null;
  opponent: string | null;
  title: string;
  gameMeta: { home_team: string; away_team: string; is_home: boolean } | null;
};

interface Props {
  playerFirstName: string;
  training: TrainingData | null;
  trainingAnswer: Answer | null;
  trainingConfirmedCount: number;
  trainingDeadlineIso: string | null;
  gameData: GameData | null;
  gameAnswer: Answer | null;
  gameConfirmedCount: number;
  gameDeadlineIso: string | null;
  /** true quando o jogador não tem perfil ligado (não mostra botões de RSVP) */
  noPlayerProfile: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PT_DAYS  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const PT_MONTHS_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PT_MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function todayLabel() {
  const d = new Date();
  return `${PT_DAYS[d.getDay()].toUpperCase()}, ${d.getDate()} ${PT_MONTHS_ABBR[d.getMonth()].toUpperCase()}`;
}

function fmtDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const wd = PT_DAYS[d.getDay()].slice(0, 3);
  return `${wd} ${d.getDate()} ${PT_MONTHS_ABBR[d.getMonth()]}`;
}

function trainingCardTitle(training: TrainingData) {
  const d    = new Date(training.date + "T00:00:00");
  const day  = PT_DAYS[d.getDay()];
  const time = training.start_time ? training.start_time.slice(0, 5) : null;
  return time ? `${day} · ${time}` : day;
}

function gameCardTitle(game: GameData) {
  if (game.gameMeta) {
    const opponent = game.gameMeta.is_home ? game.gameMeta.away_team : game.gameMeta.home_team;
    return `vs ${opponent}`;
  }
  if (game.opponent) return `vs ${game.opponent}`;
  return game.title;
}

function gameDateLine(game: GameData) {
  const parts: string[] = [fmtDateShort(game.event_date)];
  if (game.event_time) parts.push(game.event_time.slice(0, 5));
  return parts.join(" · ");
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  background: "#FFFDFA",
  borderRadius: "8px",
  boxShadow: "0 1px 0 rgba(26,22,18,.08), 0 8px 24px -12px rgba(26,22,18,.25)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-ibm-mono, monospace)",
  fontWeight: 500,
  letterSpacing: ".1em",
  textTransform: "uppercase",
};

const BC800: React.CSSProperties = {
  fontFamily: "var(--font-barlow-condensed, sans-serif)",
  fontWeight: 800,
  letterSpacing: ".05em",
  textTransform: "uppercase",
};

// ── Botão de disponibilidade ──────────────────────────────────────────────────

function AvailBtn({
  label,
  value,
  answer,
  saving,
  onPress,
}: {
  label: string;
  value: Answer;
  answer: Answer | null;
  saving: Answer | null;
  onPress: (v: Answer) => void;
}) {
  const isActive = answer === value;
  const isLoading = saving === value;

  const base: React.CSSProperties = {
    display:    "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight:  "52px",
    padding:    "8px 12px",
    borderRadius: "6px",
    border:     "2px solid",
    cursor:     isLoading ? "wait" : isActive && answer === value ? "default" : "pointer",
    fontFamily: "var(--font-barlow-condensed, sans-serif)",
    fontWeight: 700,
    fontSize:   "17px",
    letterSpacing: ".06em",
    textTransform: "uppercase",
    lineHeight: 1,
    transition: "background .12s, border-color .12s, color .12s",
    outline:    "none",
  };

  let style: React.CSSProperties;
  if (isActive) {
    style = value === "yes"
      ? { ...base, background: "#F97316", borderColor: "#F97316", color: "#15110E" }
      : { ...base, background: "#B3261E", borderColor: "#B3261E", color: "#fff" };
  } else {
    style = { ...base, background: "transparent", borderColor: "#1A1612", color: "#1A1612" };
  }

  return (
    <button
      type="button"
      aria-pressed={isActive}
      disabled={isLoading}
      onClick={() => onPress(value)}
      style={style}
      onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = "2px solid #F97316"; (e.currentTarget as HTMLElement).style.outlineOffset = "2px"; }}
      onBlur={(e)  => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
    >
      {isLoading ? "…" : label}
    </button>
  );
}

// ── Cartão de evento ──────────────────────────────────────────────────────────

function EventCard({
  kind,
  eventId,
  label,
  titleText,
  dateLine,
  location,
  confirmedCount,
  answer,
  deadlineIso,
  noPlayerProfile,
  detailHref,
  onAnswer,
}: {
  kind: "training" | "game";
  eventId: string;
  label: string;
  titleText: string;
  dateLine: string;
  location: string | null;
  confirmedCount: number;
  answer: Answer | null;
  deadlineIso: string | null;
  noPlayerProfile: boolean;
  detailHref: string;
  onAnswer: (v: Answer | null) => void;
}) {
  const [localAnswer, setLocalAnswer] = useState<Answer | null>(answer);
  const [saving, setSaving]           = useState<Answer | null>(null);

  const closed = deadlineIso ? new Date() > new Date(deadlineIso) : true;

  async function submit(next: Answer) {
    if (next === localAnswer || saving !== null) return;
    const prev = localAnswer;
    setLocalAnswer(next);
    onAnswer(next);
    setSaving(next);

    const url    = kind === "training"
      ? `/api/trainings/${eventId}/rsvp`
      : `/api/games/${eventId}/availability`;
    const status = kind === "training"
      ? (next === "yes" ? "going" : "not_going")
      : (next === "yes" ? "available" : "unavailable");

    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status }),
      });
      if (!res.ok) {
        setLocalAnswer(prev);
        onAnswer(prev);
        toast({ title: "Não foi possível guardar. Tenta outra vez.", variant: "destructive" });
      }
    } catch {
      setLocalAnswer(prev);
      onAnswer(prev);
      toast({ title: "Sem ligação. Tenta outra vez.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  const stateLabel = localAnswer === "yes"
    ? (kind === "training" ? "Confirmaste presença · toca para alterar" : "Disponível · toca para alterar")
    : localAnswer === "no"
      ? (kind === "training" ? "Marcaste falta · toca para alterar"     : "Não disponível · toca para alterar")
      : "Ainda não respondeste";

  const topBg   = kind === "training" ? "#1A1612" : "#1A1612";
  const topText = "#F97316";

  return (
    <div style={CARD_STYLE}>
      {/* Barra escura no topo */}
      <div
        style={{
          background: topBg,
          padding: "10px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ ...MONO, fontSize: "10px", color: topText }}>
          {label}
        </span>
        {confirmedCount > 0 && (
          <span style={{ ...MONO, fontSize: "10px", color: "#B9AFA4" }}>
            {confirmedCount} confirmado{confirmedCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Corpo */}
      <div style={{ padding: "18px 16px 14px", flex: 1 }}>
        <h2 style={{ ...BC800, fontSize: "clamp(22px,4.5vw,34px)", color: "#1A1612", margin: "0 0 10px", lineHeight: 1.05 }}>
          {titleText}
        </h2>
        <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "15px", color: "#1A1612", margin: "0 0 4px" }}>
          {dateLine}
        </p>
        {location && (
          <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "13px", color: "#6F675F", margin: 0 }}>
            {location}
          </p>
        )}
      </div>

      {/* Botões de resposta */}
      {!closed && !noPlayerProfile && (
        <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <AvailBtn
            label={kind === "training" ? "Vou"      : "Disponível"}
            value="yes"
            answer={localAnswer}
            saving={saving}
            onPress={submit}
          />
          <AvailBtn
            label={kind === "training" ? "Não vou"  : "Não posso"}
            value="no"
            answer={localAnswer}
            saving={saving}
            onPress={submit}
          />
        </div>
      )}

      {/* Linha de estado */}
      <div style={{ padding: "0 16px 14px" }}>
        {closed ? (
          <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "13px", color: "#8C837A", fontStyle: "italic" }}>
            {localAnswer === "yes" ? (kind === "training" ? "Confirmaste presença" : "Disponível") : localAnswer === "no" ? "Não disponível" : "Sem resposta"}{" · "}janela fechada
          </p>
        ) : noPlayerProfile ? null : (
          <p
            aria-live="polite"
            style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "13px", color: "#6F675F" }}
          >
            {stateLabel}
          </p>
        )}
      </div>

      {/* Link detalhe */}
      <div style={{ borderTop: "1px solid rgba(26,22,18,.08)", padding: "10px 16px" }}>
        <Link
          href={detailHref}
          style={{
            fontFamily: "var(--font-barlow, sans-serif)",
            fontSize: "12px",
            fontWeight: 600,
            color: "#C2530A",
            textDecoration: "none",
          }}
        >
          Ver detalhe →
        </Link>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MinhaAreaTop({
  playerFirstName,
  training,
  trainingAnswer,
  trainingConfirmedCount,
  trainingDeadlineIso,
  gameData,
  gameAnswer,
  gameConfirmedCount,
  gameDeadlineIso,
  noPlayerProfile,
}: Props) {
  const [tAnswer, setTAnswer] = useState<Answer | null>(trainingAnswer);
  const [gAnswer, setGAnswer] = useState<Answer | null>(gameAnswer);
  const { update: updatePending } = usePlayerPending();

  const pending =
    (training     && tAnswer == null ? 1 : 0) +
    (gameData     && gAnswer == null ? 1 : 0);

  // Sincroniza o contexto de pendentes (para dots na sidebar)
  useEffect(() => {
    updatePending({
      training: !!(training && tAnswer == null),
      game:     !!(gameData && gAnswer == null),
    });
  }, [tAnswer, gAnswer, training, gameData, updatePending]);

  const dateStr = todayLabel();

  const trainingTitle = training
    ? trainingCardTitle(training)
    : null;

  const trainingDateLine = training
    ? fmtDateShort(training.date) + (training.start_time ? " · " + training.start_time.slice(0, 5) : "")
    : null;

  const gTitle    = gameData ? gameCardTitle(gameData)    : null;
  const gDateLine = gameData ? gameDateLine(gameData)     : null;

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* Data + saudação */}
      <p style={{ ...MONO, fontSize: "11px", color: "#C2530A", marginBottom: "6px" }}>
        {dateStr}
      </p>
      <h1
        style={{
          fontFamily: "var(--font-barlow-condensed, sans-serif)",
          fontWeight: 800,
          fontSize: "clamp(28px, 5vw, 44px)",
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: "#1A1612",
          lineHeight: 1,
          margin: "0 0 20px",
        }}
      >
        OLÁ, {playerFirstName.toUpperCase()}
        {" "}
        <span style={{ color: "#F97316" }}>·</span>
        {" "}
        <span style={{ color: pending > 0 ? "#1A1612" : "#2F7A3E" }}>
          {pending > 0
            ? `${pending} POR RESPONDER`
            : "TUDO RESPONDIDO"}
        </span>
      </h1>

      {/* Grelha de cartões */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "20px",
        }}
      >
        {/* Cartão treino */}
        {training && trainingTitle && trainingDateLine && trainingDeadlineIso ? (
          <EventCard
            kind="training"
            eventId={training.id}
            label="PRÓXIMO TREINO"
            titleText={trainingTitle}
            dateLine={trainingDateLine}
            location={training.location}
            confirmedCount={trainingConfirmedCount}
            answer={tAnswer}
            deadlineIso={trainingDeadlineIso}
            noPlayerProfile={noPlayerProfile}
            detailHref={`/player/meus-treinos/${training.id}`}
            onAnswer={setTAnswer}
          />
        ) : (
          <div style={{ ...CARD_STYLE }}>
            <div style={{ background: "#1A1612", padding: "10px 16px" }}>
              <span style={{ ...MONO, fontSize: "10px", color: "#F97316" }}>PRÓXIMO TREINO</span>
            </div>
            <div style={{ padding: "18px 16px" }}>
              <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "14px", color: "#8C837A" }}>
                Sem treino agendado.
              </p>
            </div>
          </div>
        )}

        {/* Cartão jogo */}
        {gameData && gTitle && gDateLine && gameDeadlineIso ? (
          <EventCard
            kind="game"
            eventId={gameData.id}
            label="PRÓXIMO JOGO"
            titleText={gTitle}
            dateLine={gDateLine}
            location={gameData.location}
            confirmedCount={gameConfirmedCount}
            answer={gAnswer}
            deadlineIso={gameDeadlineIso}
            noPlayerProfile={noPlayerProfile}
            detailHref={`/player/meus-jogos/${gameData.id}`}
            onAnswer={setGAnswer}
          />
        ) : (
          <div style={{ ...CARD_STYLE }}>
            <div style={{ background: "#1A1612", padding: "10px 16px" }}>
              <span style={{ ...MONO, fontSize: "10px", color: "#F97316" }}>PRÓXIMO JOGO</span>
            </div>
            <div style={{ padding: "18px 16px" }}>
              <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "14px", color: "#8C837A" }}>
                Sem jogo agendado.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
