"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import {
  Upload, FileText, Table2, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronRight, History,
  RefreshCw,
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
  parse_errors?: string[];
  validation_errors?: string[];
  preview_games?: PreviewGame[];
  preview_teams?: string[];
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

// ─── Helper: format date ──────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────

export default function ImportarCalendarioPage() {
  const supabase = createClient();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>("");
  const [ourTeam, setOurTeam] = useState("CD Póvoa Masters");
  const [importAll, setImportAll] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportLog[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("seasons").select("*").order("start_date", { ascending: false })
      .then(({ data }) => {
        setSeasons(data ?? []);
        const active = (data ?? []).find((s) => s.status === "ativa");
        if (active) setSeasonId(active.id);
      });
    fetchHistory();
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

  async function sendRequest(dryRun: boolean) {
    if (!file || !seasonId) {
      toast({ title: "Seleciona o ficheiro e a temporada", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("season_id", seasonId);
      fd.append("our_team", ourTeam);
      fd.append("dry_run", String(dryRun));
      fd.append("import_all", String(importAll));

      const res = await fetch("/api/import-calendar", { method: "POST", body: fd });
      const data: ImportResult = await res.json();

      if (dryRun) {
        setPreview(data);
        setResult(null);
      } else {
        setResult(data);
        setPreview(null);
        if (data.success) {
          toast({ title: `✅ ${data.games_created} jogos importados` });
          fetchHistory();
        }
      }
    } catch (e) {
      toast({ title: "Erro de rede", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  const isPDF = ext === "pdf";
  const isExcel = ["xlsx", "xls", "ods"].includes(ext);
  const isCSV = ext === "csv";

  const currentResult = result ?? preview;
  const isPreviewMode = !!preview && !result;

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

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={importAll}
              onChange={(e) => setImportAll(e.target.checked)}
              className="rounded"
            />
            Importar todos os jogos da liga (não apenas os nossos)
          </label>
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
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
              transition-all duration-200
              ${dragging ? "border-cdpovoa-blue bg-cdpovoa-blue/5" : "border-border hover:border-cdpovoa-blue/50 hover:bg-muted/30"}
              ${file ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}
            `}
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
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => sendRequest(true)}
            disabled={loading || !seasonId}
            className="flex-1"
          >
            {loading && isPreviewMode ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="mr-2 h-4 w-4" />
            )}
            Pré-visualizar
          </Button>
          <Button
            onClick={() => sendRequest(false)}
            disabled={loading || !seasonId}
            className="flex-1 bg-cdpovoa-blue hover:bg-cdpovoa-blue/90"
          >
            {loading && !isPreviewMode ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Importar
          </Button>
        </div>
      )}

      {/* ── Preview / Result ────────────────────────── */}
      {currentResult && (
        <Card className={
          !currentResult.success ? "border-red-300 bg-red-50 dark:bg-red-950/20" :
          currentResult.errors.length > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" :
          "border-green-300 bg-green-50 dark:bg-green-950/20"
        }>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              {!currentResult.success ? (
                <XCircle className="h-5 w-5 text-red-500" />
              ) : currentResult.errors.length > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              <CardTitle className="text-base">
                {isPreviewMode ? "Pré-visualização" : "Resultado da Importação"}
              </CardTitle>
              {isPreviewMode && <Badge variant="outline">Simulação — nada foi guardado</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Jornadas", value: currentResult.jornadas_found },
                { label: "Equipas", value: isPreviewMode ? currentResult.teams_found : currentResult.teams_created },
                { label: isPreviewMode ? "Os nossos" : "Criados", value: isPreviewMode ? (currentResult.our_games ?? currentResult.games_found) : currentResult.games_created },
                { label: isPreviewMode ? "Total liga" : "Atualizados", value: isPreviewMode ? currentResult.games_found : (currentResult.games_updated ?? 0) },
              ].map((s) => (
                <div key={s.label} className="bg-white/60 dark:bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-black">{s.value ?? 0}</p>
                </div>
              ))}
            </div>

            {/* Warnings */}
            {currentResult.warnings?.length > 0 && (
              <div className="space-y-1">
                {currentResult.warnings.map((w, i) => (
                  <div key={i} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Errors */}
            {((currentResult.errors?.length ?? 0) > 0 || (currentResult.validation_errors?.length ?? 0) > 0) && (
              <div>
                <button onClick={() => setShowErrors((v) => !v)}
                  className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                  {showErrors ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {(currentResult.errors?.length ?? 0) + (currentResult.validation_errors?.length ?? 0)} erros
                </button>
                {showErrors && (
                  <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {[...(currentResult.validation_errors ?? []), ...(currentResult.errors ?? [])].map((e, i) => (
                      <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Preview games */}
            {isPreviewMode && currentResult.preview_games && currentResult.preview_games.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Jogos a importar ({currentResult.preview_games.length})
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {currentResult.preview_games.map((g, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                      <Badge variant="outline" className="shrink-0 text-[0.6rem] px-1.5">J{g.jornada}</Badge>
                      <span className="font-medium shrink-0 tabular-nums">{fmtDate(g.date)}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">{g.time}</span>
                      <span className="flex-1 truncate">{g.title}</span>
                      <span className="shrink-0 text-muted-foreground truncate max-w-[120px]">{g.location}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview teams */}
            {isPreviewMode && currentResult.preview_teams && currentResult.preview_teams.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Equipas encontradas ({currentResult.preview_teams.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentResult.preview_teams.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* After real import: confirm action */}
            {isPreviewMode && currentResult.success && (
              <Button onClick={() => sendRequest(false)} disabled={loading}
                className="w-full bg-cdpovoa-blue hover:bg-cdpovoa-blue/90">
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
                        {new Date(log.created_at).toLocaleString("pt-PT")} ·
                        {" "}{log.games_created} criados · {log.games_updated} atualizados ·
                        {" "}{log.teams_created} equipas
                      </p>
                    </div>
                    {log.errors?.length > 0 && (
                      <Badge variant="destructive" className="shrink-0 text-xs">
                        {log.errors.length} erros
                      </Badge>
                    )}
                    {log.errors?.length === 0 && (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    )}
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
