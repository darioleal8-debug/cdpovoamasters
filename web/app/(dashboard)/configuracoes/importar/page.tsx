"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import {
  Upload, FileText, Table2, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronRight, History,
  RefreshCw, Sparkles, Wrench, Copy, Check,
} from "lucide-react";
import type { Season } from "@/types/database";

// ─── Types ────────────────────────────────────────────────

interface PreviewGame {
  date: string;
  time: string;
  title: string;
  location: string;
  jornada: number;
}

interface ImportResult {
  success: boolean;
  dry_run?: boolean;
  used_ai?: boolean;
  jornadas_found: number;
  teams_found: number;
  teams_created: number;
  teams_created_list?: string[];
  games_found: number;
  games_created: number;
  games_updated: number;
  games_skipped?: number;
  our_games?: number;
  errors: string[];
  warnings: string[];
  corrections?: string[];
  parse_errors?: string[];
  validation_errors?: string[];
  preview_games?: PreviewGame[];
  preview_teams?: string[];
  // report_only mode
  report?: {
    teams: { name: string; locality: string | null; home_pavilion: string | null; ccd_number?: string | null }[];
    games: { jornada: number; date: string | null; time: string | null; home_team: string; away_team: string; is_our_game: boolean }[];
    summary: { jornadas: number; total_games: number; our_games: number; total_teams: number };
    errors: string[];
    corrections: string[];
  };
  sql?: string;
}

interface ImportLog {
  id: string;
  filename: string;
  file_type: string;
  games_created: number;
  games_updated: number;
  teams_created: number;
  errors: string[];
  created_at: string;
}

// ─── Helper ───────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

// ─── Component ────────────────────────────────────────────

export default function ImportarCalendarioPage() {
  const supabase = createClient();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>("");
  const [ourTeam, setOurTeam] = useState("CD Póvoa Masters");
  const [importAll, setImportAll] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"preview" | "import" | "report" | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [showSQL, setShowSQL] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"jogos" | "equipas" | "json">("jogos");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("seasons").select("*").order("start_date", { ascending: false })
      .then(({ data }) => {
        setSeasons(data ?? []);
        const active = (data ?? []).find((s) => s.status === "ativa");
        if (active) setSeasonId(active.id);
      });
    fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchHistory() {
    const res = await fetch("/api/import-calendar");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.imports ?? []);
    }
  }

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["pdf", "xlsx", "xls", "ods", "csv"];
    if (!allowed.includes(ext)) {
      toast({ title: "Formato não suportado", description: `Use: ${allowed.join(", ")}`, variant: "destructive" });
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function sendRequest(mode: "preview" | "import" | "report") {
    if (!file) {
      toast({ title: "Seleciona o ficheiro", variant: "destructive" });
      return;
    }
    if (mode !== "report" && !seasonId) {
      toast({ title: "Seleciona a temporada", variant: "destructive" });
      return;
    }

    setLoading(true);
    setLoadingMode(mode);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (seasonId) fd.append("season_id", seasonId);
      fd.append("our_team", ourTeam);
      fd.append("use_ai", String(useAI));
      fd.append("import_all", String(importAll));

      if (mode === "preview") fd.append("dry_run", "true");
      if (mode === "report") fd.append("report_only", "true");

      const res = await fetch("/api/import-calendar", { method: "POST", body: fd });
      const data: ImportResult = await res.json();

      if (mode === "preview" || mode === "report") {
        setPreview(data);
        setResult(null);
        setActiveTab("jogos");
      } else {
        setResult(data);
        setPreview(null);
        if (data.success) {
          toast({ title: `✅ ${data.games_created} jogos importados${data.used_ai ? " (com IA)" : ""}` });
          fetchHistory();
        }
      }
    } catch (e) {
      toast({ title: "Erro de rede", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  }

  async function copySQL() {
    const sql = (preview ?? result)?.sql;
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
  }

  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  const isPDF = ext === "pdf";
  const isExcel = ["xlsx", "xls", "ods"].includes(ext);

  const currentResult = result ?? preview;
  const isPreviewMode = !!preview && !result;
  const isReportMode = isPreviewMode && !!currentResult?.report;

  // Unified game list for report mode
  const reportGames = currentResult?.report?.games ?? [];
  const reportTeams = currentResult?.report?.teams ?? [];

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto">
      {/* ── Título ─────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar Calendário INATEL</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importa jogos do PDF ou Excel oficial da Liga INATEL Porto
        </p>
      </div>

      {/* ── Configuração ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Temporada</Label>
              <select
                value={seasonId}
                onChange={(e) => setSeasonId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Selecionar —</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.status === "ativa" ? "✓" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Nome da nossa equipa</Label>
              <Input
                value={ourTeam}
                onChange={(e) => setOurTeam(e.target.value)}
                placeholder="CD Póvoa Masters"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {/* AI toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                ${useAI ? "bg-cdpovoa-blue" : "bg-muted-foreground/30"}`}
                onClick={() => setUseAI((v) => !v)}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                  ${useAI ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className={`h-3.5 w-3.5 ${useAI ? "text-cdpovoa-blue" : "text-muted-foreground"}`} />
                Análise com IA
                {useAI && (
                  <Badge className="text-[0.6rem] bg-cdpovoa-blue/10 text-cdpovoa-blue border-cdpovoa-blue/20 ml-1">
                    Claude Haiku
                  </Badge>
                )}
              </span>
              {useAI && (
                <span className="text-xs text-muted-foreground">
                  Corrige OCR, tabelas partidas e inconsistências automaticamente
                </span>
              )}
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={importAll}
                onChange={(e) => setImportAll(e.target.checked)}
                className="rounded"
              />
              Importar todos os jogos da liga (não apenas os nossos)
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ── Upload ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ficheiro</CardTitle>
          <CardDescription>PDF, XLSX, XLS, ODS ou CSV</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={[
              "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
              dragging ? "border-cdpovoa-blue bg-cdpovoa-blue/5" : "border-border hover:border-cdpovoa-blue/50 hover:bg-muted/30",
              file ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.ods,.csv"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            {file ? (
              <div className="flex flex-col items-center gap-2">
                {isPDF ? <FileText className="h-8 w-8 text-red-500" /> :
                 isExcel ? <Table2 className="h-8 w-8 text-green-600" /> :
                 <FileText className="h-8 w-8 text-blue-500" />}
                <p className="font-semibold text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)} KB · {ext.toUpperCase()}
                </p>
                <Button variant="ghost" size="sm" className="text-xs mt-1"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); setResult(null); }}>
                  Remover
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <p className="text-sm font-medium">Arrastar ficheiro aqui</p>
                <p className="text-xs">ou clicar para selecionar</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Ações ──────────────────────────────────── */}
      {file && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => sendRequest("report")} disabled={loading} className="flex-1">
            {loadingMode === "report" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
            Analisar
          </Button>
          <Button variant="outline" onClick={() => sendRequest("preview")} disabled={loading || !seasonId} className="flex-1">
            {loadingMode === "preview" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
            Pré-visualizar
          </Button>
          <Button onClick={() => sendRequest("import")} disabled={loading || !seasonId}
            className="flex-1 bg-cdpovoa-blue hover:bg-cdpovoa-blue/90">
            {loadingMode === "import" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importar
          </Button>
        </div>
      )}

      {/* loading state with AI message */}
      {loading && useAI && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
          <Sparkles className="h-3.5 w-3.5 text-cdpovoa-blue" />
          A processar com IA — pode demorar alguns segundos...
        </div>
      )}

      {/* ── Result card ────────────────────────────── */}
      {currentResult && (
        <Card className={
          !currentResult.success ? "border-red-300 bg-red-50 dark:bg-red-950/20" :
          (currentResult.errors?.length ?? 0) > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" :
          "border-green-300 bg-green-50 dark:bg-green-950/20"
        }>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {!currentResult.success ? <XCircle className="h-5 w-5 text-red-500" /> :
               (currentResult.errors?.length ?? 0) > 0 ? <AlertTriangle className="h-5 w-5 text-amber-500" /> :
               <CheckCircle2 className="h-5 w-5 text-green-600" />}
              <CardTitle className="text-base">
                {isReportMode ? "Análise do Ficheiro" : isPreviewMode ? "Pré-visualização" : "Resultado da Importação"}
              </CardTitle>
              {isPreviewMode && !isReportMode && <Badge variant="outline">Simulação — nada guardado</Badge>}
              {currentResult.used_ai && (
                <Badge className="bg-cdpovoa-blue/10 text-cdpovoa-blue border-cdpovoa-blue/20 text-[0.6rem]">
                  <Sparkles className="h-2.5 w-2.5 mr-1" /> IA
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Summary stats */}
            {isReportMode && currentResult.report ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Jornadas", value: currentResult.report.summary.jornadas },
                  { label: "Equipas", value: currentResult.report.summary.total_teams },
                  { label: "Total jogos", value: currentResult.report.summary.total_games },
                  { label: "Os nossos", value: currentResult.report.summary.our_games },
                ].map((s) => (
                  <div key={s.label} className="bg-white/60 dark:bg-white/5 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-black">{s.value ?? 0}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Jornadas", value: currentResult.jornadas_found },
                  { label: "Equipas", value: isPreviewMode ? currentResult.teams_found : currentResult.teams_created },
                  { label: isPreviewMode ? "Os nossos" : "Criados", value: isPreviewMode ? (currentResult.our_games ?? currentResult.games_found) : currentResult.games_created },
                  { label: isPreviewMode ? "Total" : "Atualizados", value: isPreviewMode ? currentResult.games_found : (currentResult.games_updated ?? 0) },
                ].map((s) => (
                  <div key={s.label} className="bg-white/60 dark:bg-white/5 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-black">{s.value ?? 0}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Corrections banner */}
            {((currentResult.corrections?.length ?? 0) > 0 || (currentResult.report?.corrections?.length ?? 0) > 0) && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
                <button
                  onClick={() => setShowCorrections((v) => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400 w-full text-left"
                >
                  {showCorrections ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <Sparkles className="h-3.5 w-3.5" />
                  {(currentResult.corrections ?? currentResult.report?.corrections ?? []).length} correções de IA aplicadas
                </button>
                {showCorrections && (
                  <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                    {(currentResult.corrections ?? currentResult.report?.corrections ?? []).map((c, i) => (
                      <li key={i} className="text-xs text-blue-700 dark:text-blue-300 font-mono">• {c}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Warnings */}
            {(currentResult.warnings?.length ?? 0) > 0 && (
              <div className="space-y-1">
                {currentResult.warnings!.map((w, i) => (
                  <div key={i} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Errors */}
            {((currentResult.errors?.length ?? 0) + (currentResult.validation_errors?.length ?? 0) + (currentResult.report?.errors?.length ?? 0)) > 0 && (
              <div>
                <button onClick={() => setShowErrors((v) => !v)}
                  className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                  {showErrors ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {(currentResult.errors?.length ?? 0) + (currentResult.validation_errors?.length ?? 0) + (currentResult.report?.errors?.length ?? 0)} erros/avisos
                </button>
                {showErrors && (
                  <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {[...(currentResult.validation_errors ?? []), ...(currentResult.errors ?? []), ...(currentResult.report?.errors ?? [])].map((e, i) => (
                      <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tabs: Jogos / Equipas / JSON ─── */}
            {(isReportMode || (isPreviewMode && currentResult.preview_games)) && (
              <div>
                {/* Tab headers */}
                <div className="flex gap-1 border-b mb-3">
                  {(["jogos", "equipas", "json"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 text-xs font-semibold capitalize rounded-t transition-colors
                        ${activeTab === tab
                          ? "bg-white dark:bg-white/10 border border-b-white dark:border-b-background text-foreground"
                          : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {tab === "jogos" ? "Jogos" : tab === "equipas" ? "Equipas" : "JSON / SQL"}
                    </button>
                  ))}
                </div>

                {/* Tab: Jogos */}
                {activeTab === "jogos" && (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {(isReportMode ? reportGames : currentResult.preview_games ?? []).map((g, i) => {
                      const isGame = "home_team" in g;
                      const jornada = isGame ? (g as typeof reportGames[0]).jornada : (g as PreviewGame).jornada;
                      const title = isGame
                        ? `${(g as typeof reportGames[0]).home_team} × ${(g as typeof reportGames[0]).away_team}`
                        : (g as PreviewGame).title;
                      const date = isGame ? (g as typeof reportGames[0]).date : (g as PreviewGame).date;
                      const time = isGame ? (g as typeof reportGames[0]).time : (g as PreviewGame).time;
                      const isOurs = isGame ? (g as typeof reportGames[0]).is_our_game : true;

                      return (
                        <div key={i} className={`flex items-center gap-2 text-xs py-1 border-b last:border-0
                          ${isOurs ? "" : "opacity-60"}`}>
                          <Badge variant="outline" className="shrink-0 text-[0.6rem] px-1.5">J{jornada}</Badge>
                          <span className="font-medium shrink-0 tabular-nums w-16">{fmtDate(date)}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums w-10">{time ?? "—"}</span>
                          <span className={`flex-1 truncate ${isOurs ? "font-semibold" : ""}`}>{title}</span>
                          {isOurs && <Badge className="shrink-0 text-[0.55rem] bg-cdpovoa-blue/10 text-cdpovoa-blue border-cdpovoa-blue/20">nosso</Badge>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Tab: Equipas */}
                {activeTab === "equipas" && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {(isReportMode ? reportTeams : (currentResult.preview_teams ?? []).map((n) => ({ name: n, locality: null, home_pavilion: null }))).map((t, i) => (
                      <div key={i} className="flex items-start gap-2 py-1 border-b last:border-0 text-xs">
                        <span className="font-semibold flex-1">{t.name}</span>
                        {t.locality && <span className="text-muted-foreground shrink-0">{t.locality}</span>}
                        {t.home_pavilion && (
                          <span className="text-muted-foreground shrink-0 max-w-[160px] truncate">{t.home_pavilion}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab: JSON / SQL */}
                {activeTab === "json" && (
                  <div className="space-y-3">
                    {currentResult.report && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">JSON</p>
                        <pre className="text-[0.6rem] bg-muted rounded p-2 overflow-auto max-h-48 font-mono">
                          {JSON.stringify(currentResult.report, null, 2)}
                        </pre>
                      </div>
                    )}
                    {currentResult.sql && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <button onClick={() => setShowSQL((v) => !v)}
                            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            {showSQL ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            SQL Inserts
                          </button>
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={copySQL}>
                            {sqlCopied ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                            {sqlCopied ? "Copiado!" : "Copiar SQL"}
                          </Button>
                        </div>
                        {showSQL && (
                          <pre className="text-[0.6rem] bg-muted rounded p-2 overflow-auto max-h-64 font-mono">
                            {currentResult.sql}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Non-report preview: old team badges */}
            {isPreviewMode && !isReportMode && currentResult.preview_teams && activeTab === "equipas" && (
              <div className="flex flex-wrap gap-1.5">
                {currentResult.preview_teams.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            )}

            {/* Confirm import button */}
            {isPreviewMode && currentResult.success && !isReportMode && (
              <Button onClick={() => sendRequest("import")} disabled={loading}
                className="w-full bg-cdpovoa-blue hover:bg-cdpovoa-blue/90">
                <Upload className="mr-2 h-4 w-4" />
                Confirmar Importação
              </Button>
            )}

            {/* After analysis: offer to import */}
            {isReportMode && currentResult.success && seasonId && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => sendRequest("preview")} disabled={loading} className="flex-1">
                  <ChevronRight className="mr-2 h-4 w-4" />
                  Pré-visualizar
                </Button>
                <Button onClick={() => sendRequest("import")} disabled={loading}
                  className="flex-1 bg-cdpovoa-blue hover:bg-cdpovoa-blue/90">
                  <Upload className="mr-2 h-4 w-4" />
                  Importar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Histórico ──────────────────────────────── */}
      <div>
        <button
          onClick={() => { setShowHistory((v) => !v); if (!showHistory) fetchHistory(); }}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <History className="h-4 w-4" />
          Histórico de importações
          {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma importação registada.</p>
            ) : (
              history.map((log) => (
                <Card key={log.id} className="border-border">
                  <CardContent className="py-3 flex items-center gap-3">
                    {log.file_type === "pdf"
                      ? <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      : <Table2 className="h-4 w-4 text-green-600 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{log.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("pt-PT")} ·
                        {" "}{log.games_created} criados · {log.games_updated} atualizados ·
                        {" "}{log.teams_created} equipas
                      </p>
                    </div>
                    {log.errors?.length > 0
                      ? <Badge variant="destructive" className="shrink-0 text-xs">{log.errors.length} erros</Badge>
                      : <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
