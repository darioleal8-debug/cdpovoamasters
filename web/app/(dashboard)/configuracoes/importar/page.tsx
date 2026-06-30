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
  RefreshCw, Sparkles, Wrench, Copy, Check, Info,
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

interface ReportGame {
  jornada: number;
  date: string | null;
  time: string | null;
  home_team: string;
  away_team: string;
  is_our_game: boolean;
}

interface ReportTeam {
  name: string;
  locality: string | null;
  home_pavilion: string | null;
  ccd_number?: string | null;
}

interface ImportResult {
  success: boolean;
  error?: string;         // single error string (API errors)
  errors?: string[];      // array of errors
  warnings?: string[];
  corrections?: string[];
  parse_errors?: string[];
  validation_errors?: string[];
  detail?: string;
  // preview/import fields
  dry_run?: boolean;
  used_ai?: boolean;
  jornadas_found?: number;
  teams_found?: number;
  teams_created?: number;
  teams_created_list?: string[];
  games_found?: number;
  games_created?: number;
  games_updated?: number;
  games_skipped?: number;
  our_games?: number;
  preview_games?: PreviewGame[];
  preview_teams?: string[];
  // report mode
  report?: {
    teams: ReportTeam[];
    games: ReportGame[];
    jornadas: { number: number; games: number[] }[];
    summary: { jornadas_count: number; total_games: number; our_games: number; total_teams: number };
    errors: string[];
    corrections: string[];
  };
  sql?: string;
  raw_text_preview?: string;
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
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" });
  } catch { return iso; }
}

function getAllErrors(r: ImportResult): string[] {
  return [
    r.error ? [r.error] : [],
    r.errors ?? [],
    r.parse_errors ?? [],
    r.validation_errors ?? [],
    r.report?.errors ?? [],
  ].flat().filter(Boolean);
}

function getAllWarnings(r: ImportResult): string[] {
  return [...(r.warnings ?? [])].filter(Boolean);
}

function getAllCorrections(r: ImportResult): string[] {
  return [...(r.corrections ?? []), ...(r.report?.corrections ?? [])].filter(Boolean);
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
  const [result, setResult] = useState<ImportResult | null>(null);
  const [resultMode, setResultMode] = useState<"preview" | "import" | "report" | null>(null);
  const [history, setHistory] = useState<ImportLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [showSQL, setShowSQL] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"jogos" | "equipas" | "json">("jogos");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("seasons")
      .select("*")
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        setSeasons(data ?? []);
        const active = (data ?? []).find((s) => s.status === "ativa");
        if (active) setSeasonId(active.id);
      });
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchHistory() {
    try {
      const res = await fetch("/api/import-calendar");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.imports ?? []);
      }
    } catch { /* ignore */ }
  }

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["pdf", "xlsx", "xls", "ods", "csv"];
    if (!allowed.includes(ext)) {
      toast({ title: "Formato não suportado", description: `Usa: ${allowed.join(", ")}`, variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setResultMode(null);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function sendRequest(mode: "preview" | "import" | "report") {
    if (!file) {
      toast({ title: "Seleciona um ficheiro primeiro", variant: "destructive" });
      return;
    }
    if (mode !== "report" && !seasonId) {
      toast({ title: "Seleciona uma temporada", variant: "destructive" });
      return;
    }

    setLoading(true);
    setLoadingMode(mode);
    setResult(null);
    setResultMode(null);

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

      let data: ImportResult;
      try {
        data = await res.json();
      } catch {
        data = {
          success: false,
          error: `O servidor devolveu uma resposta inválida (HTTP ${res.status})`,
        };
      }

      // If HTTP error and data.error exists, surface it
      if (!res.ok && !data.errors?.length && data.error) {
        data.errors = [data.error];
      }

      setResult(data);
      setResultMode(mode);
      setActiveTab("jogos");

      if (!data.success) {
        const msg = data.error ?? data.errors?.[0] ?? "Erro desconhecido";
        toast({ title: "Erro na importação", description: msg, variant: "destructive" });
      } else if (mode === "import") {
        toast({ title: `✅ ${data.games_created ?? 0} jogos importados${data.used_ai ? " (com IA)" : ""}` });
        fetchHistory();
      }
    } catch (e) {
      const msg = (e as Error).message;
      setResult({ success: false, error: msg, errors: [msg] });
      setResultMode(mode);
      toast({ title: "Erro de rede", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  }

  async function copySQL() {
    const sql = result?.sql;
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
  }

  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  const isPDF = ext === "pdf";
  const isExcel = ["xlsx", "xls", "ods"].includes(ext);

  const allErrors = result ? getAllErrors(result) : [];
  const allWarnings = result ? getAllWarnings(result) : [];
  const allCorrections = result ? getAllCorrections(result) : [];
  const isReportMode = resultMode === "report" && !!result?.report;
  const reportGames = result?.report?.games ?? [];
  const reportTeams = result?.report?.teams ?? [];

  const statusColor =
    !result ? "" :
    !result.success ? "border-red-300 bg-red-50 dark:bg-red-950/20" :
    allErrors.length > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" :
    "border-green-300 bg-green-50 dark:bg-green-950/20";

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
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={useAI}
                onClick={() => setUseAI((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none
                  ${useAI ? "bg-cdpovoa-blue" : "bg-muted-foreground/30"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                  ${useAI ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className={`h-3.5 w-3.5 ${useAI ? "text-cdpovoa-blue" : "text-muted-foreground"}`} />
                Análise com IA (Claude Sonnet)
                {useAI && (
                  <Badge className="text-[0.6rem] bg-cdpovoa-blue/10 text-cdpovoa-blue border-cdpovoa-blue/20 ml-1">
                    Recomendado
                  </Badge>
                )}
              </span>
            </div>
            {useAI && (
              <p className="text-xs text-muted-foreground ml-12">
                Corrige OCR, tabelas partidas e inconsistências automaticamente. Requer ANTHROPIC_API_KEY no .env.local
              </p>
            )}

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
            onClick={() => !file && inputRef.current?.click()}
            className={[
              "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
              !file ? "cursor-pointer" : "",
              dragging ? "border-cdpovoa-blue bg-cdpovoa-blue/5" :
              file ? "border-green-500 bg-green-50 dark:bg-green-950/20" :
              "border-border hover:border-cdpovoa-blue/50 hover:bg-muted/30",
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setResult(null);
                    setResultMode(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Remover ficheiro
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

      {/* ── Botões de ação ─────────────────────────── */}
      {file && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={loading}
            onClick={() => sendRequest("report")}
          >
            {loadingMode === "report"
              ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              : <Wrench className="mr-2 h-4 w-4" />}
            Analisar
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={loading || !seasonId}
            onClick={() => sendRequest("preview")}
          >
            {loadingMode === "preview"
              ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              : <ChevronRight className="mr-2 h-4 w-4" />}
            Pré-visualizar
          </Button>
          <Button
            className="flex-1 bg-cdpovoa-blue hover:bg-cdpovoa-blue/90"
            disabled={loading || !seasonId}
            onClick={() => sendRequest("import")}
          >
            {loadingMode === "import"
              ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              : <Upload className="mr-2 h-4 w-4" />}
            Importar
          </Button>
        </div>
      )}

      {/* ── Loading indicator ──────────────────────── */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted/40 rounded-lg animate-pulse">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {useAI
            ? "A processar com IA (Claude Sonnet) — pode demorar 10-30 segundos..."
            : "A processar o ficheiro..."}
        </div>
      )}

      {/* ── Resultado ──────────────────────────────── */}
      {result && (
        <Card className={statusColor}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {!result.success
                ? <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                : allErrors.length > 0
                ? <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                : <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
              <CardTitle className="text-base">
                {isReportMode ? "Análise do Ficheiro"
                  : resultMode === "preview" ? "Pré-visualização"
                  : resultMode === "import" ? "Resultado da Importação"
                  : "Resultado"}
              </CardTitle>
              {resultMode === "preview" && result.success && (
                <Badge variant="outline" className="text-xs">Simulação — nada foi guardado</Badge>
              )}
              {result.used_ai && (
                <Badge className="bg-cdpovoa-blue/10 text-cdpovoa-blue border-cdpovoa-blue/20 text-[0.6rem]">
                  <Sparkles className="h-2.5 w-2.5 mr-1" /> IA
                </Badge>
              )}
              {!result.used_ai && result.success && (
                <Badge variant="secondary" className="text-[0.6rem]">Parser regex</Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">

            {/* ── Stats grid ── */}
            {result.success && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {isReportMode && result.report ? (
                  <>
                    {[
                      { label: "Jornadas", value: result.report.summary.jornadas_count },
                      { label: "Equipas",  value: result.report.summary.total_teams },
                      { label: "Jogos",    value: result.report.summary.total_games },
                      { label: "Os nossos",value: result.report.summary.our_games },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/60 dark:bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-2xl font-black">{s.value ?? 0}</p>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      { label: "Jornadas", value: result.jornadas_found },
                      { label: resultMode === "import" ? "Equipas criadas" : "Equipas",
                        value: resultMode === "import" ? result.teams_created : result.teams_found },
                      { label: resultMode === "import" ? "Jogos criados" : "Os nossos",
                        value: resultMode === "import" ? result.games_created : (result.our_games ?? result.games_found) },
                      { label: resultMode === "import" ? "Atualizados" : "Total liga",
                        value: resultMode === "import" ? result.games_updated : result.games_found },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/60 dark:bg-white/5 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="text-2xl font-black">{s.value ?? 0}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ── Erros críticos ── */}
            {allErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/10 p-3">
                <button
                  onClick={() => setShowErrors((v) => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400 w-full text-left"
                >
                  {showErrors ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <XCircle className="h-3.5 w-3.5" />
                  {allErrors.length} {allErrors.length === 1 ? "erro" : "erros"}
                </button>
                {showErrors && (
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {allErrors.map((e, i) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-300 font-mono bg-red-50 dark:bg-red-950/20 p-1.5 rounded">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Avisos ── */}
            {allWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-3">
                {allWarnings.map((w, i) => (
                  <div key={i} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* ── Correções IA ── */}
            {allCorrections.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
                <button
                  onClick={() => setShowCorrections((v) => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400 w-full text-left"
                >
                  {showCorrections ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <Sparkles className="h-3.5 w-3.5" />
                  {allCorrections.length} correções aplicadas pela IA
                </button>
                {showCorrections && (
                  <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                    {allCorrections.map((c, i) => (
                      <li key={i} className="text-xs text-blue-700 dark:text-blue-300 font-mono">• {c}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Tabs ── */}
            {result.success && (isReportMode || result.preview_games || result.preview_teams) && (
              <div>
                <div className="flex gap-1 border-b mb-3">
                  {(["jogos", "equipas", "json"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-t-sm transition-colors
                        ${activeTab === tab
                          ? "bg-white dark:bg-white/10 border border-b-white dark:border-b-background text-foreground"
                          : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {tab === "jogos" ? `Jogos (${isReportMode ? reportGames.length : (result.preview_games?.length ?? 0)})`
                        : tab === "equipas" ? `Equipas (${isReportMode ? reportTeams.length : (result.preview_teams?.length ?? 0)})`
                        : "JSON / SQL"}
                    </button>
                  ))}
                </div>

                {/* Tab: Jogos */}
                {activeTab === "jogos" && (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {isReportMode
                      ? reportGames.map((g, i) => (
                          <div key={i} className={`flex items-center gap-2 text-xs py-1.5 border-b last:border-0 ${!g.is_our_game ? "opacity-50" : ""}`}>
                            <Badge variant="outline" className="shrink-0 text-[0.6rem] px-1.5">J{g.jornada}</Badge>
                            <span className="shrink-0 w-14 text-muted-foreground tabular-nums">{fmtDate(g.date)}</span>
                            <span className="shrink-0 w-10 text-muted-foreground tabular-nums">{g.time ?? "—"}</span>
                            <span className={`flex-1 truncate ${g.is_our_game ? "font-semibold" : ""}`}>
                              {g.home_team} × {g.away_team}
                            </span>
                            {g.is_our_game && (
                              <Badge className="shrink-0 text-[0.55rem] bg-cdpovoa-blue/10 text-cdpovoa-blue border-cdpovoa-blue/20">nosso</Badge>
                            )}
                          </div>
                        ))
                      : (result.preview_games ?? []).map((g, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b last:border-0">
                            <Badge variant="outline" className="shrink-0 text-[0.6rem] px-1.5">J{g.jornada}</Badge>
                            <span className="shrink-0 w-14 text-muted-foreground tabular-nums">{fmtDate(g.date)}</span>
                            <span className="shrink-0 w-10 text-muted-foreground tabular-nums">{g.time}</span>
                            <span className="flex-1 font-semibold truncate">{g.title}</span>
                            <span className="shrink-0 text-muted-foreground text-[0.6rem] max-w-[120px] truncate">{g.location}</span>
                          </div>
                        ))
                    }
                    {isReportMode && reportGames.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum jogo encontrado.</p>
                    )}
                  </div>
                )}

                {/* Tab: Equipas */}
                {activeTab === "equipas" && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {(isReportMode
                      ? reportTeams
                      : (result.preview_teams ?? []).map((n) => ({ name: n, locality: null, home_pavilion: null }))
                    ).map((t, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 border-b last:border-0 text-xs">
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
                    {result.report && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">JSON</p>
                        <pre className="text-[0.6rem] bg-muted rounded p-2 overflow-auto max-h-48 font-mono whitespace-pre-wrap">
                          {JSON.stringify(result.report, null, 2)}
                        </pre>
                      </div>
                    )}
                    {result.sql && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <button
                            onClick={() => setShowSQL((v) => !v)}
                            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"
                          >
                            {showSQL ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            SQL Inserts
                          </button>
                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={copySQL}>
                            {sqlCopied ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                            {sqlCopied ? "Copiado!" : "Copiar SQL"}
                          </Button>
                        </div>
                        {showSQL && (
                          <pre className="text-[0.6rem] bg-muted rounded p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                            {result.sql}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Texto bruto (debug) ── */}
            {result.raw_text_preview && (
              <div>
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <Info className="h-3 w-3" />
                  {showRaw ? "Ocultar" : "Ver"} texto extraído do ficheiro (debug)
                </button>
                {showRaw && (
                  <pre className="mt-2 text-[0.6rem] bg-muted rounded p-2 overflow-auto max-h-40 font-mono whitespace-pre-wrap">
                    {result.raw_text_preview}
                  </pre>
                )}
              </div>
            )}

            {/* ── Botões de ação pós-análise ── */}
            {result.success && isReportMode && seasonId && (
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => sendRequest("preview")} disabled={loading} className="flex-1">
                  <ChevronRight className="mr-2 h-4 w-4" />
                  Pré-visualizar
                </Button>
                <Button
                  onClick={() => sendRequest("import")}
                  disabled={loading}
                  className="flex-1 bg-cdpovoa-blue hover:bg-cdpovoa-blue/90"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Importar agora
                </Button>
              </div>
            )}

            {result.success && resultMode === "preview" && (
              <Button
                onClick={() => sendRequest("import")}
                disabled={loading}
                className="w-full bg-cdpovoa-blue hover:bg-cdpovoa-blue/90"
              >
                <Upload className="mr-2 h-4 w-4" />
                Confirmar Importação
              </Button>
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
                        {new Date(log.created_at).toLocaleString("pt-PT")} ·{" "}
                        {log.games_created} criados · {log.games_updated} atualizados ·{" "}
                        {log.teams_created} equipas
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
