"use client";

import { useState } from "react";
import type { PublicGame } from "@/types/competitions";
import { cn } from "@/lib/utils";

interface Props {
  games: PublicGame[];   // eligible games (past, no approved result)
  competitionId: string;
  preselectedGameId?: string;
}

type Step = "select_game" | "enter_score" | "identify" | "submitted";

const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
function fmtDate(d: string) {
  const dt = new Date(d + "T12:00:00");
  return `${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`;
}

export function ResultSubmitForm({ games, competitionId, preselectedGameId }: Props) {
  const [step, setStep] = useState<Step>(preselectedGameId ? "enter_score" : "select_game");
  const [selectedGameId, setSelectedGameId] = useState(preselectedGameId ?? "");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGame = games.find((g) => g.id === selectedGameId);

  async function submit() {
    if (!selectedGame) return;
    setError(null);

    const hs = parseInt(homeScore, 10);
    const as_ = parseInt(awayScore, 10);

    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) {
      setError("Introduz marcações válidas (números positivos).");
      return;
    }
    if (hs === as_) {
      setError("Empates não existem em basquetebol — verifica as marcações.");
      return;
    }
    if (!name.trim()) {
      setError("Indica o teu nome.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/public/result-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id:            selectedGame.id,
          competition_id:      competitionId,
          home_team_name:      selectedGame.home_team,
          away_team_name:      selectedGame.away_team,
          home_score:          hs,
          away_score:          as_,
          submitted_by_name:   name.trim(),
          submitted_by_team:   team.trim() || null,
          submitted_by_contact: contact.trim() || null,
          notes:               notes.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro desconhecido");
        return;
      }
      setStep("submitted");
    } catch {
      setError("Erro de rede. Tenta de novo.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "submitted") {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="text-4xl">✓</div>
        <h2 className="text-xl font-semibold">Resultado submetido!</h2>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          A tua submissão foi recebida e será analisada pelo responsável da Liga antes de ser publicada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Step 1: select game */}
      <div className={cn(step !== "select_game" && selectedGame && "opacity-60")}>
        <label className="block text-sm font-semibold mb-2">1. Seleciona o jogo</label>
        {step === "select_game" ? (
          <div className="space-y-2">
            {games.length === 0 ? (
              <p className="text-sm text-muted-foreground">Não há jogos com resultado pendente.</p>
            ) : (
              games.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGameId(g.id); setStep("enter_score"); }}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/50",
                    g.pending_count > 0 ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-900/10" : "border-border"
                  )}
                >
                  <div className="text-sm font-medium">{g.home_team} vs {g.away_team}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {g.jornada ? `Jornada ${g.syntheticJornada} · ` : ""}{fmtDate(g.event_date)}
                    {g.pending_count > 0 && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">· {g.pending_count} subm. pendente{g.pending_count > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        ) : selectedGame ? (
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <div className="text-sm font-medium">{selectedGame.home_team} vs {selectedGame.away_team}</div>
              <div className="text-xs text-muted-foreground">{selectedGame.jornada ? `Jornada ${selectedGame.syntheticJornada} · ` : ""}{fmtDate(selectedGame.event_date)}</div>
            </div>
            <button onClick={() => { setStep("select_game"); setSelectedGameId(""); }} className="text-xs text-orange-500 underline">alterar</button>
          </div>
        ) : null}
      </div>

      {/* Step 2: enter score */}
      {(step === "enter_score" || step === "identify") && selectedGame && (
        <div className={cn(step === "identify" && "opacity-60")}>
          <label className="block text-sm font-semibold mb-2">2. Marcação final</label>
          {step === "enter_score" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block truncate">{selectedGame.home_team}</label>
                  <input
                    type="number" min="0" max="300"
                    value={homeScore}
                    onChange={(e) => setHomeScore(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-2xl font-bold border rounded-lg p-2 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <span className="text-muted-foreground text-xl pt-5">–</span>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block truncate">{selectedGame.away_team}</label>
                  <input
                    type="number" min="0" max="300"
                    value={awayScore}
                    onChange={(e) => setAwayScore(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-2xl font-bold border rounded-lg p-2 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  const hs = parseInt(homeScore, 10);
                  const as_ = parseInt(awayScore, 10);
                  if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) { setError("Marcações inválidas"); return; }
                  if (hs === as_) { setError("Empates não existem em basquetebol"); return; }
                  setError(null);
                  setStep("identify");
                }}
                className="w-full py-2.5 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
              >
                Continuar
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <div className="text-center text-2xl font-bold tabular-nums">{homeScore} – {awayScore}</div>
              <button onClick={() => setStep("enter_score")} className="text-xs text-orange-500 underline block mx-auto mt-1">alterar</button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: identify */}
      {step === "identify" && selectedGame && (
        <div>
          <label className="block text-sm font-semibold mb-2">3. Quem és?</label>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="O teu nome"
                className="w-full border rounded-lg p-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Equipa (opcional)</label>
              <input
                type="text"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="Equipa de que és adepto/a"
                className="w-full border rounded-lg p-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Contacto (opcional)</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Telemóvel ou email (para contacto se necessário)"
                className="w-full border rounded-lg p-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notas (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: resultado alterado em campo, fora de prazo, etc."
                rows={2}
                className="w-full border rounded-lg p-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-orange-500 text-white font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "A submeter…" : "Submeter resultado"}
            </button>
            <p className="text-xs text-muted-foreground text-center">
              A submissão será analisada antes de ser publicada.
            </p>
          </div>
        </div>
      )}

      {error && step !== "identify" && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
