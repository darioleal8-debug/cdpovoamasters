"use client";

import { useState, useEffect } from "react";
import {
  Upload, Loader2, Check, AlertTriangle, Plus,
  ChevronDown, ChevronUp, FileText, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type {
  HistImportAnalysis, HistMatchedRow,
  HistConfirmPayload, HistConfirmResult,
} from "@/lib/hist-importer/types";

interface Season { id: string; label: string; start_year: number; end_year: number }
type Step = "setup" | "analyzing" | "team_name" | "review" | "confirming" | "done";

interface Props {
  onImported?: () => void;
}

function secsToMin(s: number) {
  if (!s) return "–";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ImportWizard({ onImported }: Props) {
  const [step,       setStep]       = useState<Step>("setup");
  const [seasons,    setSeasons]    = useState<Season[]>([]);
  const [seasonId,   setSeasonId]   = useState("");
  const [newLabel,   setNewLabel]   = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [creatingS,  setCreatingS]  = useState(false);
  const [file,       setFile]       = useState<File | null>(null);
  const [analysis,   setAnalysis]   = useState<HistImportAnalysis | null>(null);
  const [pdfName,    setPdfName]    = useState("");
  const [rows,       setRows]       = useState<HistMatchedRow[]>([]);
  const [result,     setResult]     = useState<HistConfirmResult | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [logOpen,       setLogOpen]       = useState(false);
  const [teamNameInput, setTeamNameInput] = useState("");

  useEffect(() => {
    fetch("/api/hist/seasons")
      .then((r) => r.json())
      .then((d) => setSeasons(d.seasons ?? []))
      .catch(() => {});
  }, []);

  async function createSeason() {
    if (!newLabel.trim()) return;
    setCreatingS(true);
    const res  = await fetch("/api/hist/seasons", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error); setCreatingS(false); return; }
    setSeasons((prev) => [json.season, ...prev]);
    setSeasonId(json.season.id);
    setNewLabel(""); setShowNew(false); setError(null);
    setCreatingS(false);
  }

  async function handleAnalyze(overrideName?: string) {
    if (!file || !seasonId) return;
    setStep("analyzing"); setError(null);
    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("hist_season_id", seasonId);
    if (overrideName) fd.append("team_name_override", overrideName);
    const res  = await fetch("/api/hist/import", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      if (json.code === "players_not_found") { setStep("team_name"); return; }
      setError(json.error ?? "Erro"); setStep("setup"); return;
    }
    const anal: HistImportAnalysis = json.analysis;
    setAnalysis(anal); setRows(anal.rows); setPdfName(json.pdf_filename ?? file.name);
    setStep("review");
  }

  async function handleConfirm() {
    if (!analysis) return;
    setStep("confirming"); setError(null);

    const assignments = rows
      .filter((r) => r.include)
      .map((r) => ({
        hist_player_id: r.hist_player_id,
        new_player_name: r.new_player_name,
        jersey_number: r.extracted.pdf_number,
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

    const payload: HistConfirmPayload = {
      hist_season_id: seasonId,
      game_meta:      analysis.game_meta,
      pdf_filename:   pdfName,
      assignments,
    };

    const res  = await fetch("/api/hist/import/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Erro"); setStep("review"); return; }
    setResult(json.result); setStep("done");
    onImported?.();
  }

  function updateRow(idx: number, patch: Partial<HistMatchedRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function reassignPlayer(idx: number, playerId: string) {
    if (playerId === "__new__") {
      updateRow(idx, { hist_player_id: null, hist_player_name: null, status: "new" });
      return;
    }
    const season = analysis?.rows[idx]?.candidates.find((c) => c.id === playerId) ?? null;
    updateRow(idx, {
      hist_player_id:   season?.id ?? null,
      hist_player_name: season?.name ?? null,
      status: season ? "ok" : "new",
    });
  }

  const okCount        = rows.filter((r) => r.status === "ok").length;
  const ambigCount     = rows.filter((r) => r.status === "ambiguous").length;
  const newCount       = rows.filter((r) => r.status === "new").length;
  const includedCount  = rows.filter((r) => r.include).length;
  const selectedSeason = seasons.find((s) => s.id === seasonId);

  return (
    <div className="space-y-6">

      {/* ── Step: Setup ─────────────────────────────────── */}
      {step === "setup" && (
        <div className="space-y-6 max-w-lg">
          {/* Season select */}
          <div className="space-y-2">
            <Label className="font-medium">Temporada</Label>
            <div className="flex gap-2">
              <select
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Seleccionar temporada —</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowNew((v) => !v)} title="Criar nova temporada">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {showNew && (
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: 2018/2019"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createSeason()}
                />
                <Button onClick={createSeason} disabled={creatingS || !newLabel.trim()} size="sm">
                  {creatingS ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </div>
            )}
          </div>

          {/* File picker */}
          <div className="space-y-2">
            <Label className="font-medium">Boxscore — PDF ou Imagem</Label>
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground font-medium">
                {file ? file.name : "Clique para seleccionar PDF ou imagem (JPG, PNG)"}
              </span>
              {file && <span className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(0)} KB · {file.type || "ficheiro"}</span>}
              <input type="file" accept=".pdf,application/pdf,image/jpeg,image/jpg,image/png,image/webp" className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
            </label>
            <p className="text-xs text-muted-foreground">PDF via DeepSeek · Imagem via Claude Vision</p>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <Button onClick={() => handleAnalyze()} disabled={!file || !seasonId} className="w-full">
            <FileText className="mr-2 h-4 w-4" />
            {file && ["image/jpeg","image/jpg","image/png","image/webp"].includes(file.type)
              ? "Interpretar Imagem com Claude Vision"
              : "Interpretar PDF com DeepSeek"}
          </Button>
        </div>
      )}

      {/* ── Step: Analyzing ─────────────────────────────── */}
      {step === "analyzing" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-medium">A interpretar PDF com IA…</p>
            <p className="text-sm text-muted-foreground mt-1">O DeepSeek está a extrair o boxscore. Aguarde 10–30 segundos.</p>
          </div>
        </div>
      )}

      {/* ── Step: Team Name Override ────────────────────── */}
      {step === "team_name" && (
        <div className="space-y-4 max-w-lg">
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-semibold mb-1">Equipa CD Póvoa não identificada no PDF</p>
              <p>O DeepSeek não reconheceu automaticamente o nome da equipa. Introduza o nome exacto como aparece no PDF (ex: <strong>*Masters_CDP</strong>, <strong>Póvoa Masters</strong>).</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="font-medium">Nome da equipa no PDF</Label>
            <Input
              placeholder="Ex: *Masters_CDP"
              value={teamNameInput}
              onChange={(e) => setTeamNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && teamNameInput.trim() && handleAnalyze(teamNameInput.trim())}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("setup")}>Voltar</Button>
            <Button
              className="flex-1"
              disabled={!teamNameInput.trim()}
              onClick={() => handleAnalyze(teamNameInput.trim())}
            >
              <FileText className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Review ────────────────────────────────── */}
      {(step === "review" || step === "confirming") && analysis && (
        <div className="space-y-4">

          {/* Game meta */}
          {(analysis.game_meta.opponent_name || analysis.game_meta.game_date || analysis.game_meta.competition) && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex flex-wrap gap-4 text-sm">
              {analysis.game_meta.game_date && (
                <span><strong>Data:</strong> {new Date(analysis.game_meta.game_date + "T00:00:00").toLocaleDateString("pt-PT")}</span>
              )}
              {analysis.game_meta.opponent_name && (
                <span><strong>Adversário:</strong> {analysis.game_meta.opponent_name}</span>
              )}
              {(analysis.game_meta.home_score !== null && analysis.game_meta.away_score !== null) && (
                <span><strong>Resultado:</strong> CD Póvoa {analysis.game_meta.home_score} – {analysis.game_meta.away_score} {analysis.game_meta.opponent_name}</span>
              )}
              {analysis.game_meta.competition && (
                <span><strong>Competição:</strong> {analysis.game_meta.competition}</span>
              )}
              <span className="text-muted-foreground"><strong>Temporada:</strong> {selectedSeason?.label}</span>
            </div>
          )}

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50 text-xs">
              <Check className="h-3 w-3" /> {okCount} identificados
            </Badge>
            {ambigCount > 0 && (
              <Badge variant="outline" className="gap-1 text-yellow-700 border-yellow-300 bg-yellow-50 text-xs">
                <AlertTriangle className="h-3 w-3" /> {ambigCount} ambíguos
              </Badge>
            )}
            {newCount > 0 && (
              <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300 bg-blue-50 text-xs">
                <UserPlus className="h-3 w-3" /> {newCount} novos jogadores
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{includedCount} de {rows.length} a importar</span>
          </div>

          {/* Review table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2 font-semibold"># / Nome PDF</th>
                  <th className="text-left px-3 py-2 font-semibold min-w-[200px]">Jogador no Histórico</th>
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
                    <tr key={idx} className={[
                      "transition-colors",
                      !r.include ? "opacity-40 bg-muted/20" : "",
                      r.status === "ambiguous" && r.include ? "bg-yellow-50/60" : "",
                      r.status === "new" && r.include ? "bg-blue-50/40" : "",
                    ].filter(Boolean).join(" ")}>
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-muted-foreground mr-1.5">{e.pdf_number != null ? `#${e.pdf_number}` : "?"}</span>
                        <span className="font-medium">{e.pdf_name}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        {r.status === "new" ? (
                          <input
                            value={r.new_player_name}
                            onChange={(ev) => updateRow(idx, { new_player_name: ev.target.value })}
                            placeholder="Nome do novo jogador"
                            className="w-full rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <select
                            value={r.hist_player_id ?? "__new__"}
                            onChange={(ev) => reassignPlayer(idx, ev.target.value)}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="__new__">+ Criar como novo jogador</option>
                            {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {r.status === "ok"        && <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-green-700">OK</span>}
                        {r.status === "ambiguous" && <span className="inline-flex items-center rounded-full bg-yellow-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-yellow-700">Ambíguo</span>}
                        {r.status === "new"       && <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-blue-700">Novo</span>}
                      </td>
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
                      <td className="px-2 py-1.5 text-center">
                        <Checkbox checked={r.include} onCheckedChange={(v) => updateRow(idx, { include: !!v })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {analysis.errors.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-800">
              <strong>Avisos IA: </strong>{analysis.errors.join(" · ")}
            </div>
          )}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("setup")} disabled={step === "confirming"}>Voltar</Button>
            <Button onClick={handleConfirm} disabled={step === "confirming" || includedCount === 0}>
              {step === "confirming"
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />A guardar…</>
                : <><Check className="mr-1.5 h-4 w-4" />Confirmar {includedCount} jogador{includedCount !== 1 ? "es" : ""}</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Done ──────────────────────────────────── */}
      {step === "done" && result && (
        <div className="space-y-5 max-w-sm mx-auto py-4">
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">Importação concluída!</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Importados", value: result.imported, color: "text-primary" },
              { label: "Novos jogadores", value: result.new_players, color: "text-blue-600" },
              { label: "Com erro", value: result.skipped, color: "text-muted-foreground" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-3 text-center">
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 space-y-1">
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-800">{e}</p>)}
            </div>
          )}
          {analysis?.ai_log && (
            <div>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setLogOpen((v) => !v)}>
                {logOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Log técnico
              </button>
              {logOpen && <pre className="mt-1 rounded-lg bg-muted px-3 py-2 text-[0.65rem] font-mono text-muted-foreground">{analysis.ai_log}</pre>}
            </div>
          )}
          <Button className="w-full" onClick={() => { setStep("setup"); setFile(null); setAnalysis(null); setRows([]); setResult(null); setError(null); }}>
            Importar outro jogo
          </Button>
        </div>
      )}
    </div>
  );
}
