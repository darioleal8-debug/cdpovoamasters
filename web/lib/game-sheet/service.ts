/**
 * Lógica de servidor partilhada pelas rotas de importação do boletim.
 * Usa SEMPRE o cliente com a sessão do utilizador (RLS ativo) — nunca service role.
 */
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { normalizeName, parseGameMeta } from "@/types/competitions";
import { matchHoophubPlayers, type RosterEntry } from "./roster";
import { SheetDataSchema, type ImportStatus, type SheetData } from "./schema";
import { visionConfig } from "./vision";

export type Supa = Awaited<ReturnType<typeof createClient>>;

export const BUCKET = "folhas-jogo";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function jsonError(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export interface Access {
  supabase: Supa;
  user: User;
  teamId: string | null;
  teamName: string | null;
  isLigaAdmin: boolean;
}

/** Autenticação + papel (delegado de equipa e/ou admin da liga). */
export async function authorizeGameSheet(): Promise<{ ok: true; access: Access } | { ok: false; response: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: jsonError("Não autenticado", 401) };

  const [{ data: membership }, { data: isLigaAdmin }] = await Promise.all([
    supabase.from("league_team_members").select("team_id, league_teams(name)").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("is_liga_admin"),
  ]);
  const teamName = (membership?.league_teams as unknown as { name: string } | null)?.name ?? null;
  if (!membership && !isLigaAdmin) return { ok: false, response: jsonError("Sem acesso de equipa", 403) };

  return {
    ok: true,
    access: { supabase, user, teamId: membership?.team_id ?? null, teamName, isLigaAdmin: Boolean(isLigaAdmin) },
  };
}

export interface GameInfo {
  id: string;
  date: string | null;
  home: string;
  away: string;
  isTest: boolean;
}

/**
 * Carrega o jogo e confirma que pertence à equipa do delegado. Nunca confia no
 * identificador enviado pelo cliente sem esta verificação.
 */
export async function loadGameForAccess(access: Access, eventId: string): Promise<GameInfo | null> {
  if (!isUuid(eventId)) return null;
  const { data: ev } = await access.supabase
    .from("events")
    .select("id, event_date, description, is_test, deleted_at")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ev) return null;
  const meta = parseGameMeta(ev.description as string | null);
  if (!meta?.home_team || !meta.away_team) return null;
  if (!access.isLigaAdmin) {
    const mine = normalizeName(access.teamName ?? "");
    if (!mine || (normalizeName(meta.home_team) !== mine && normalizeName(meta.away_team) !== mine)) return null;
  }
  return {
    id: ev.id as string,
    date: (ev.event_date as string | null) ?? null,
    home: meta.home_team,
    away: meta.away_team,
    isTest: Boolean(ev.is_test) || meta.is_test === true,
  };
}

export interface ImportRow {
  id: string;
  event_id: string;
  team_id: string | null;
  created_by: string | null;
  status: ImportStatus;
  image_path: string | null;
  image_sha256: string | null;
  schema_version: number;
  processing_version: string | null;
  model: string | null;
  sheet_data: unknown;
  validation: unknown;
  ai_usage: unknown;
  analysis_count: number;
  corrections: unknown[];
  error: string | null;
  submission_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

const IMPORT_COLUMNS =
  "id, event_id, team_id, created_by, status, image_path, image_sha256, schema_version, processing_version, model, sheet_data, validation, ai_usage, analysis_count, corrections, error, submission_id, confirmed_at, created_at, updated_at";

export async function loadImport(access: Access, id: string): Promise<ImportRow | null> {
  if (!isUuid(id)) return null;
  // RLS garante que só a equipa dona (ou o admin da liga) vê a importação
  const { data } = await access.supabase.from("game_sheet_imports").select(IMPORT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  if (!access.isLigaAdmin && data.team_id !== access.teamId) return null;
  return data as unknown as ImportRow;
}

/** Validação rigorosa dos dados editados (vindos do cliente). */
export function parseSheet(input: unknown): { ok: true; sheet: SheetData } | { ok: false; error: string } {
  const r = SheetDataSchema.safeParse(input);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `Dados inválidos em ${first.path.join(".") || "boletim"}: ${first.message}` };
  }
  const ids = new Set<string>();
  for (const x of [...r.data.players, ...r.data.events]) {
    if (ids.has(x.id)) return { ok: false, error: `Identificador repetido: ${x.id}` };
    ids.add(x.id);
  }
  return { ok: true, sheet: r.data };
}

/** Diferença resumida entre duas versões (registo de correções manuais). */
export function diffSheets(before: SheetData | null, after: SheetData): string[] {
  if (!before) return ["preenchimento manual"];
  const changes: string[] = [];
  if (JSON.stringify(before.final) !== JSON.stringify(after.final)) {
    changes.push(`resultado ${before.final.home ?? "?"}-${before.final.away ?? "?"} → ${after.final.home ?? "?"}-${after.final.away ?? "?"}`);
  }
  if (JSON.stringify(before.periods) !== JSON.stringify(after.periods)) changes.push("parciais");
  if (JSON.stringify(before.sheetTeamAIsHome) !== JSON.stringify(after.sheetTeamAIsHome)) changes.push("equipas trocadas");
  const evBefore = new Map(before.events.map((e) => [e.id, JSON.stringify(e)]));
  const changedEvents = after.events.filter((e) => evBefore.get(e.id) !== JSON.stringify(e)).length
    + before.events.filter((e) => !after.events.some((x) => x.id === e.id)).length;
  if (changedEvents) changes.push(`${changedEvents} marcação(ões)`);
  const plBefore = new Map(before.players.map((p) => [p.id, JSON.stringify(p)]));
  const changedPlayers = after.players.filter((p) => plBefore.get(p.id) !== JSON.stringify(p)).length
    + before.players.filter((p) => !after.players.some((x) => x.id === p.id)).length;
  if (changedPlayers) changes.push(`${changedPlayers} jogador(es)`);
  if (JSON.stringify(before.officials) !== JSON.stringify(after.officials)) changes.push("oficiais");
  if (JSON.stringify(before.teamFouls) !== JSON.stringify(after.teamFouls) ||
      JSON.stringify(before.timeouts) !== JSON.stringify(after.timeouts)) changes.push("faltas/descontos de equipa");
  return changes;
}

/** Associa jogadores ao plantel HoopHub quando a equipa é o clube dono da plataforma. */
export async function enrichWithRoster(supabase: Supa, sheet: SheetData): Promise<SheetData> {
  try {
    const { data: ours } = await supabase.from("league_teams").select("name").eq("is_our_team", true).maybeSingle();
    if (!ours?.name) return sheet;
    const ourNorm = normalizeName(ours.name as string);
    const side = normalizeName(sheet.teams.home.name) === ourNorm ? "home"
      : normalizeName(sheet.teams.away.name) === ourNorm ? "away" : null;
    if (!side) return sheet;
    const { data: roster } = await supabase.from("v_active_roster").select("player_id, name, number");
    return matchHoophubPlayers(sheet, side, (roster ?? []) as RosterEntry[]);
  } catch {
    return sheet; // associação é opcional
  }
}

/** Vista devolvida ao cliente: sem resposta bruta do modelo, com URL temporário da imagem. */
export async function importView(access: Access, row: ImportRow, game: GameInfo | null) {
  let imageUrl: string | null = null;
  if (row.image_path) {
    const { data } = await access.supabase.storage.from(BUCKET).createSignedUrl(row.image_path, 60 * 30);
    imageUrl = data?.signedUrl ?? null;
  }
  const usage = row.ai_usage as { model?: string; totalDurationMs?: number; calls?: unknown[]; secondPass?: string } | null;
  return {
    id: row.id,
    event_id: row.event_id,
    status: row.status,
    schema_version: row.schema_version,
    processing_version: row.processing_version,
    model: row.model,
    sheet: row.sheet_data,
    analysis_count: row.analysis_count,
    max_analyses: visionConfig().maxAnalyses,
    corrections: row.corrections,
    error: row.error,
    submission_id: row.submission_id,
    confirmed_at: row.confirmed_at,
    updated_at: row.updated_at,
    usage: usage ? { model: usage.model, durationMs: usage.totalDurationMs, calls: usage.calls?.length ?? 0, secondPass: usage.secondPass } : null,
    image_url: imageUrl,
    game,
    can_edit: row.status !== "published" && row.status !== "processing",
    is_liga_admin: access.isLigaAdmin,
  };
}
