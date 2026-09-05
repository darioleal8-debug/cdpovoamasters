"use client";

import { useState, useEffect } from "react";
import {
  Upload, Loader2, Check, AlertTriangle,
  ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { ImportAnalysis, MatchedRow, ConfirmPayload } from "@/lib/stats-importer/types";

interface RosterPlayer {
  id: string;          // players.id
  name: string;
  number: number | null;
}

interface Props {
  open:          boolean;
  onClose:       () => void;
  eventId:       string;
  sessionId:     string;
  opponentName:  string | null;
  rosterPlayers: RosterPlayer[];
  onImported?:   () => void;
}

type Step = "upload" | "analyzing" | "team_name" | "review" | "confirming" | "done";

export function ImportStatsModal({
  open, onClose, eventId, sessionId, opponentName, rosterPlayers, onImported,
}: Props) {
  const [step,        setStep]        = useState<Step>("upload");
  const [file,        setFile]        = useState<File | null>(null);
  const [mode,        setMode]        = useState<"replace" | "merge">("replace");
  const [updateScore, setUpdateScore] = useState(true);
  const [analysis,    setAnalysis]    = useState<ImportAnalysis | null>(null);
  const [rows,        setRows]        = useState<MatchedRow[]>([]);
  const [result,      setResult]      = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [logOpen,       setLogOpen]       = useState(false);
  const [teamNameInput, setTeamNameInput] = useState("");

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("upload"); setFile(null); setAnalysis(null);
      setRows([]); setResult(null); setError(null); setLogOpen(false);
      setTeamNameInput("");
    }
  }, [open]);

  async function handleAnalyze(overrideName?: string) {
    if (!file) return;
    setStep("analyzing");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      fd.append("session_id", sessionId);
      if (overrideName) fd.append("team_name_override", overrideName);
      const res  = await fetch(`/api/games/${eventId}/import-stats`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "players_not_found") { setStep("team_name"); return; }
        setError(json.error ?? "Erro desconhecido"); setStep("upload"); return;
      }
      const anal: ImportAnalysis = json.analysis;
      setAnalysis(anal);
      setRows(anal.rows);
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
      setStep("upload");
    }
  }

  async function handleConfirm() {
    if (!analysis) return;
    setStep("confirming");
    setError(null);

    const assignments = rows
      .filter((r) => r.include && r.player_id)
      .map((r) => ({
        player_id: r.player_id!,
        stats: {
          seconds_played:  r.extracted.seconds_played,
          fg2_made:        r.extracted.fg2_made,  fg2_att: r.extracted.fg2_att,
          fg3_made:        r.extracted.fg3_made,  fg3_att: r.extracted.fg3_att,
          ft_made:         r.extracted.ft_made,   ft_att:  r.extracted.ft_att,
          reb_off:         r.extracted.reb_off,   reb_def: r.extracted.reb_def,
          ast:             r.extracted.ast,        stl:     r.extracted.stl,
          blk:             r.extracted.blk,        tov:     r.extracted.tov,
          fouls_committed: r.extracted.fouls_committed,
          fouls_drawn:     r.extracted.fouls_drawn,
          pts:             r.extracted.pts,
          plus_minus:      r.extracted.plus_minus,
        },
      }));

    const payload: ConfirmPayload = {
      session_id:   sessionId,
      mode,
      update_score: updateScore,
      home_score:   updateScore ? analysis.pdf_home_score : null,
      away_score:   updateScore ? analysis.pdf_away_score : null,
      assignments,
    };

    try {
      const res  = await fetch(`/api/games/${eventId}/import-stats/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro ao confirmar"); setStep("review"); return; }
      setResult(json.result);
      setStep("done");
      onImported?.();
    } catch (e) {
      setError((e as Error).message);
      setStep("review");
    }
  }

  function updateRow(idx: number, patch: Partial<MatchedRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function reassignPlayer(idx: number, playerId: string) {
    if (playerId === "__none__") {
      updateRow(idx, { player_id: null, player_name: null, player_number: null, status: "unmatched", include: false });
      return;
    }
    const p = rosterPlayers.find((x) => x.id === playerId);
    if (!p) return;
    updateRow(idx, { player_id: p.id, player_name: p.name, player_number: p.number, status: "ok", candidates: [] });
  }

  function secsToMin(s: number) {
    if (!s) return "–";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  const includedCount  = rows.filter((r) => r.include && r.player_id).length;
  const okCount        = rows.filter((r) => r.status === "ok").length;
  const ambigCount     = rows.filter((r) => r.status === "ambiguous").length;
  const unmatchedCount = rows.filter((r) => r.status === "unmatched").length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-5xl p-0 flex flex-col max-h-[90vh] gap-0">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogHeader>
            <DialogTitle>Importar Estatísticas via PDF</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              CD Póvoa vs {opponentName ?? "Adversário"}
            </p>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step: Upload ───────────────────────────────── */}
          {step === "upload" && (
            <div className="space-y-6 max-w-lg mx-auto">
              {/* File picker */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Boxscore — PDF ou Imagem</Label>
                <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground font-medium">
                    {file ? file.name : "Clique para seleccionar PDF ou imagem (JPG, PNG)"}
                  </span>
                  {file && (
                    <span className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(0)} KB · {file.type || "ficheiro"}
                    </span>
                  )}
                  <input
                    type="file"
                    accept=".pdf,application/pdf,image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
                  />
                </label>
                <p className="text-xs text-muted-foreground">PDF via DeepSeek · Imagem via Claude Vision</p>
              </div>

              {/* Mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Modo de importação</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["replace", "merge"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={[
                        "rounded-lg border p-3 text-left transition-all",
                        mode === m
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50",
                      ].join(" ")}
                    >
                      <p className="font-semibold text-sm">
                        {m === "replace" ? "Substituir" : "Completar"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m === "replace"
                          ? "Apaga stats actuais e importa todas do PDF"
                          : "Actualiza existentes e acrescenta as novas"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step: Analyzing ────────────────────────────── */}
          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">A analisar PDF com IA…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  O DeepSeek está a extrair as estatísticas do boxscore. Aguarde 10–30 segundos.
                </p>
              </div>
            </div>
          )}

          {/* ── Step: Team Name Override ────────────────────── */}
          {step === "team_name" && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">Equipa CD Póvoa não identificada no PDF</p>
                  <p>O DeepSeek não reconheceu automaticamente o nome da equipa. Introduza o nome exacto como aparece no PDF (ex: <strong>*Masters_CDP</strong>, <strong>Póvoa Masters</strong>).</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nome da equipa no PDF</Label>
                <Input
                  placeholder="Ex: *Masters_CDP"
                  value={teamNameInput}
                  onChange={(e) => setTeamNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && teamNameInput.trim() && handleAnalyze(teamNameInput.trim())}
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* ── Step: Review ───────────────────────────────── */}
          {(step === "review" || step === "confirming") && analysis && (
            <div className="space-y-4">

              {/* Status summary */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50 text-xs">
                  <Check className="h-3 w-3" /> {okCount} identificados
                </Badge>
                {ambigCount > 0 && (
                  <Badge variant="outline" className="gap-1 text-yellow-700 border-yellow-300 bg-yellow-50 text-xs">
                    <AlertTriangle className="h-3 w-3" /> {ambigCount} ambíguos
                  </Badge>
                )}
                {unmatchedCount > 0 && (
                  <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50 text-xs">
                    <AlertTriangle className="h-3 w-3" /> {unmatchedCount} não encontrados
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {includedCount} de {rows.length} a importar
                </span>
              </div>

              {/* Score update */}
              {(analysis.pdf_home_score !== null || analysis.pdf_away_score !== null) && (
                <div className="flex items-center gap-3 rounded-lg border px-4 py-2.5 bg-muted/30">
                  <Checkbox
                    id="update-score"
                    checked={updateScore}
                    onCheckedChange={(v) => setUpdateScore(!!v)}
                  />
                  <Label htmlFor="update-score" className="text-sm cursor-pointer">
                    Actualizar marcador:{" "}
                    <strong>
                      CD Póvoa {analysis.pdf_home_score} – {analysis.pdf_away_score}{" "}
                      {analysis.pdf_opponent ?? "Adversário"}
                    </strong>
                  </Label>
                </div>
              )}

              {/* Review table */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-semibold"># / Nome PDF</th>
                      <th className="text-left px-3 py-2 font-semibold min-w-[168px]">Jogador no Plantel</th>
                      <th className="px-2 py-2 font-semibold">Estado</th>
                      <th className="px-2 py-2 font-semibold">MIN</th>
                      <th className="px-2 py-2 font-semibold text-center">PTS</th>
                      <th className="px-2 py-2 font-semibold text-center">REB</th>
                      <th className="px-2 py-2 font-semibold text-center">AST</th>
                      <th className="px-2 py-2 font-semibold text-center">STL</th>
                      <th className="px-2 py-2 font-semibold text-center">BLK</th>
                      <th className="px-2 py-2 font-semibold text-center">TOV</th>
                      <th className="px-2 py-2 font-semibold text-center">2P</th>
                      <th className="px-2 py-2 font-semibold text-center">3P</th>
                      <th className="px-2 py-2 font-semibold text-center">LL</th>
                      <th className="px-2 py-2 font-semibold text-center">✓</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, idx) => {
                      const e = r.extracted;
                      return (
                        <tr
                          key={idx}
                          className={[
                            "transition-colors",
                            !r.include ? "opacity-40 bg-muted/20" : "",
                            r.status === "ambiguous" && r.include ? "bg-yellow-50/60" : "",
                            r.status === "unmatched" && r.include ? "bg-red-50/40" : "",
                          ].filter(Boolean).join(" ")}
                        >
                          {/* PDF id */}
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-muted-foreground mr-1.5">
                              {e.pdf_number != null ? `#${e.pdf_number}` : "?"}
                            </span>
                            <span className="font-medium">{e.pdf_name}</span>
                          </td>

                          {/* Player assignment */}
                          <td className="px-3 py-1.5">
                            <select
                              value={r.player_id ?? "__none__"}
                              onChange={(ev) => reassignPlayer(idx, ev.target.value)}
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              <option value="__none__">— Não incluir —</option>
                              {rosterPlayers
                                .slice()
                                .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.number != null ? `#${p.number} ` : ""}{p.name}
                                  </option>
                                ))}
                            </select>
                          </td>

                          {/* Status */}
                          <td className="px-2 py-1.5 text-center">
                            {r.status === "ok" && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-green-700">OK</span>
                            )}
                            {r.status === "ambiguous" && (
                              <span className="inline-flex items-center rounded-full bg-yellow-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-yellow-700">Ambíguo</span>
                            )}
                            {r.status === "unmatched" && (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-red-700">Não enc.</span>
                            )}
                          </td>

                          {/* Stats */}
                          <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">{secsToMin(e.seconds_played)}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums font-bold">{e.pts}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.reb_off + e.reb_def}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.ast}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.stl}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.blk}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.tov}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.fg2_made}/{e.fg2_att}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.fg3_made}/{e.fg3_att}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{e.ft_made}/{e.ft_att}</td>

                          {/* Include toggle */}
                          <td className="px-2 py-1.5 text-center">
                            <Checkbox
                              checked={r.include}
                              disabled={!r.player_id}
                              onCheckedChange={(v) => updateRow(idx, { include: !!v })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* AI warnings */}
              {analysis.errors.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-xs text-yellow-800">
                  <span className="font-semibold">Avisos da IA: </span>
                  {analysis.errors.join(" · ")}
                </div>
              )}

              {/* Error from confirm */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step: Done ─────────────────────────────────── */}
          {step === "done" && result && (
            <div className="space-y-5 max-w-sm mx-auto py-4">
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold">Importação concluída!</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-4xl font-black text-primary">{result.imported}</p>
                  <p className="text-xs text-muted-foreground mt-1">Jogadores importados</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-4xl font-black text-muted-foreground">{result.skipped}</p>
                  <p className="text-xs text-muted-foreground mt-1">Com erro</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 space-y-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-800">{e}</p>
                  ))}
                </div>
              )}

              {analysis?.ai_log && (
                <div>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setLogOpen((v) => !v)}
                  >
                    {logOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Log técnico
                  </button>
                  {logOpen && (
                    <pre className="mt-1.5 rounded-lg bg-muted px-3 py-2 text-[0.65rem] font-mono text-muted-foreground overflow-x-auto">
                      {analysis.ai_log}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-3">
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => handleAnalyze()} disabled={!file}>
                <FileText className="mr-1.5 h-4 w-4" />
                {file && ["image/jpeg","image/jpg","image/png","image/webp"].includes(file.type)
                  ? "Analisar Imagem"
                  : "Analisar PDF"}
              </Button>
            </>
          )}

          {step === "analyzing" && (
            <>
              <span />
              <Button disabled>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                A analisar…
              </Button>
            </>
          )}

          {step === "team_name" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button
                disabled={!teamNameInput.trim()}
                onClick={() => handleAnalyze(teamNameInput.trim())}
              >
                <FileText className="mr-1.5 h-4 w-4" />
                Tentar novamente
              </Button>
            </>
          )}

          {(step === "review" || step === "confirming") && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("upload")}
                disabled={step === "confirming"}
              >
                Voltar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={step === "confirming" || includedCount === 0}
              >
                {step === "confirming" ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />A guardar…</>
                ) : (
                  <><Check className="mr-1.5 h-4 w-4" />Confirmar {includedCount} jogador{includedCount !== 1 ? "es" : ""}</>
                )}
              </Button>
            </>
          )}

          {step === "done" && (
            <>
              <span />
              <Button onClick={onClose}>Fechar</Button>
            </>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
