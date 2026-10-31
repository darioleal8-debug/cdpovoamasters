/**
 * Folhas de jogo de um jogo, do ponto de vista do admin da liga:
 *  - lista todas as imagens (submissões dos delegados + importações + uploads do admin)
 *  - analisa cada uma com o DeepSeek e pontua a qualidade da leitura
 *  - indica a melhor para rever e aplicar ao jogo
 */
import type { User } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { todayInClubTz } from "@/lib/time/club-time";
import { resolveSheetLocation } from "@/lib/liga/sheet-location";
import { sha256, sniffImageMime, type AcceptedMime } from "./image";
import { pickBest, scoreReading, type ReadingQuality } from "./quality";
import { reanalyzeImport, runAndStore } from "./run";
import { AiSheetSchema, SheetDataSchema, type ImportStatus } from "./schema";
import { BUCKET, loadImport, type Access, type GameInfo } from "./service";
import { visionConfig } from "./vision";

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;
type UserClient = Awaited<ReturnType<typeof createClient>>;

/** Uma importação em 'processing' há mais do que isto é considerada abandonada. */
const STALE_PROCESSING_MS = 3 * 60 * 1000;
const SIGNED_URL_TTL = 30 * 60;

export function adminAccess(supabase: UserClient, user: User): Access {
  return { supabase, user, teamId: null, teamName: null, isLigaAdmin: true };
}

export interface SheetCandidate {
  key: string;
  kind: "import" | "submission";
  id: string;
  import_id: string | null;
  origin: "delegado" | "admin";
  label: string;
  created_at: string;
  status: ImportStatus | "por_analisar" | "nao_suportado" | "ficheiro_em_falta";
  image_url: string | null;
  is_pdf: boolean;
  quality: ReadingQuality | null;
  analyzed_at: string | null;
  analysis_count: number;
  error: string | null;
  is_best: boolean;
}

export interface GameSheetsOverview {
  game: GameInfo;
  finished: boolean;
  candidates: SheetCandidate[];
  best_key: string | null;
  max_analyses: number;
}

/** Jogo terminado: já tem resultado aprovado ou a data (fuso do clube) já passou/é hoje. */
export async function isGameFinished(supabase: UserClient, game: GameInfo): Promise<boolean> {
  if (game.date && game.date <= todayInClubTz()) return true;
  const { data } = await supabase.from("league_game_results").select("id").eq("event_id", game.id).maybeSingle();
  return Boolean(data);
}

export async function listGameSheets(access: Access, admin: AdminClient, game: GameInfo): Promise<GameSheetsOverview> {
  const [{ data: subs }, { data: imps }] = await Promise.all([
    admin
      .from("result_submissions")
      .select("id, status, photo_url, submitted_by_name, submitted_by_team, submitted_at")
      .eq("event_id", game.id)
      .order("submitted_at", { ascending: true }),
    access.supabase
      .from("game_sheet_imports")
      .select("id, team_id, status, image_path, image_mime, sheet_data, extraction_raw, analysis_count, error, source_submission_id, created_at, updated_at")
      .eq("event_id", game.id)
      .order("created_at", { ascending: true }),
  ]);

  const imports = (imps ?? []) as {
    id: string; team_id: string | null; status: ImportStatus; image_path: string | null; image_mime: string | null;
    sheet_data: unknown; extraction_raw: unknown; analysis_count: number; error: string | null;
    source_submission_id: string | null; created_at: string; updated_at: string;
  }[];
  const importedPaths = new Set(imports.map((i) => i.image_path).filter(Boolean));
  const importedSubs = new Set(imports.map((i) => i.source_submission_id).filter(Boolean));
  const subName = new Map((subs ?? []).map((s) => [s.id as string, (s.submitted_by_team ?? s.submitted_by_name) as string]));

  const sign = async (bucket: string, path: string): Promise<{ url: string | null; missing: boolean }> => {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
    if (error) {
      const missing = /object not found/i.test(error.message);
      if (!missing) console.error(`[game-sheets] signed URL ${bucket}/${path}: ${error.message}`);
      return { url: null, missing };
    }
    return { url: data.signedUrl, missing: false };
  };

  const candidates: SheetCandidate[] = [];

  for (const imp of imports) {
    let quality: ReadingQuality | null = null;
    const sheet = SheetDataSchema.safeParse(imp.sheet_data);
    if (sheet.success && imp.status !== "failed" && imp.status !== "processing") {
      const ai = AiSheetSchema.safeParse(imp.extraction_raw ?? {});
      quality = scoreReading(sheet.data, ai.success ? ai.data.imageQuality : null);
    }
    const fromSub = imp.source_submission_id ? subName.get(imp.source_submission_id) : null;
    const { url: impUrl, missing: impMissing } = imp.image_path ? await sign(BUCKET, imp.image_path) : { url: null, missing: false };
    candidates.push({
      key: `imp:${imp.id}`,
      kind: "import",
      id: imp.id,
      import_id: imp.id,
      origin: imp.team_id ? "delegado" : fromSub ? "delegado" : "admin",
      label: imp.team_id ? "Importação do delegado" : fromSub ? `Folha submetida (${fromSub})` : "Folha carregada pelo admin",
      created_at: imp.created_at,
      status: impMissing ? "ficheiro_em_falta" : imp.status,
      image_url: impUrl,
      is_pdf: imp.image_mime === "application/pdf",
      quality: impMissing ? null : quality,
      analyzed_at: quality && !impMissing ? imp.updated_at : null,
      analysis_count: imp.analysis_count,
      error: impMissing ? "Ficheiro em falta — volte a carregar" : imp.error,
      is_best: false,
    });
  }

  for (const s of subs ?? []) {
    const loc = resolveSheetLocation(s.photo_url as string | null);
    if (!loc) continue;
    if (importedSubs.has(s.id) || (loc.bucket === BUCKET && importedPaths.has(loc.path))) continue;
    const { url: subUrl, missing: subMissing } = await sign(loc.bucket, loc.path);
    candidates.push({
      key: `sub:${s.id}`,
      kind: "submission",
      id: s.id as string,
      import_id: null,
      origin: "delegado",
      label: `Folha submetida (${(s.submitted_by_team ?? s.submitted_by_name) as string})`,
      created_at: s.submitted_at as string,
      status: subMissing ? "ficheiro_em_falta" : loc.kind === "pdf" ? "nao_suportado" : "por_analisar",
      image_url: subUrl,
      is_pdf: loc.kind === "pdf",
      quality: null,
      analyzed_at: null,
      analysis_count: 0,
      error: subMissing ? "Ficheiro em falta — volte a carregar" : null,
      is_best: false,
    });
  }

  const best = pickBest(candidates.map((c) => ({ ...c, analyzedAt: c.analyzed_at })));
  if (best) candidates.forEach((c) => { c.is_best = c.key === best.key; });

  return {
    game,
    finished: await isGameFinished(access.supabase, game),
    candidates,
    best_key: best?.key ?? null,
    max_analyses: visionConfig().maxAnalyses,
  };
}

export type AnalyzeOutcome =
  | { ok: true; import_id: string; analysis_error: string | null; skipped?: boolean }
  | { ok: false; status: number; error: string };

async function releaseStale(access: Access, eventId: string) {
  await access.supabase
    .from("game_sheet_imports")
    .update({ status: "failed", error: "Processamento interrompido", updated_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - STALE_PROCESSING_MS).toISOString());
}

/** Cria uma importação do admin para a imagem (reutiliza se a mesma imagem já existir) e analisa-a. */
export async function createAndAnalyze(
  access: Access,
  admin: AdminClient,
  game: GameInfo,
  buffer: Buffer,
  mime: AcceptedMime,
  opts: { existingPath?: string; sourceSubmissionId?: string } = {},
): Promise<AnalyzeOutcome> {
  const hash = sha256(buffer);

  // Inclui linhas "failed" para as reutilizar em vez de criar duplicados
  const { data: same } = await access.supabase
    .from("game_sheet_imports")
    .select("id, status")
    .eq("event_id", game.id)
    .eq("image_sha256", hash)
    .maybeSingle();

  if (same && same.status !== "failed") {
    return { ok: true, import_id: same.id as string, analysis_error: null, skipped: true };
  }

  await releaseStale(access, game.id);

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "application/pdf" ? "pdf" : "jpg";
  const imagePath = opts.existingPath ?? `admin/${game.id}/${hash}.${ext}`;

  // Upload ANTES do insert: se falhar não fica linha órfã na BD
  if (!opts.existingPath) {
    const { error: upErr } = await admin.storage.from(BUCKET).upload(imagePath, buffer, { contentType: mime, upsert: false });
    if (upErr) {
      if (/exists|duplicate/i.test(upErr.message)) {
        // "Exists" pode ser falso positivo — verifica que o objeto está mesmo lá
        const { error: chkErr } = await admin.storage.from(BUCKET).createSignedUrl(imagePath, 10);
        if (chkErr && /object not found/i.test(chkErr.message)) {
          const { error: reupErr } = await admin.storage.from(BUCKET).upload(imagePath, buffer, { contentType: mime, upsert: true });
          if (reupErr) {
            console.error(`[game-sheets] upload retry ${imagePath}: ${reupErr.message}`);
            return { ok: false, status: 500, error: `Erro no upload: ${reupErr.message}` };
          }
        }
      } else {
        console.error(`[game-sheets] upload ${imagePath}: ${upErr.message}`);
        return { ok: false, status: 500, error: `Erro no upload: ${upErr.message}` };
      }
    }
  }

  let importId: string;

  if (same?.status === "failed") {
    // Reutiliza a linha falhada em vez de criar outra
    const { error: updErr } = await access.supabase
      .from("game_sheet_imports")
      .update({ status: "processing", error: null, model: visionConfig().model, updated_at: new Date().toISOString() })
      .eq("id", same.id);
    if (updErr) {
      if (!opts.existingPath) await admin.storage.from(BUCKET).remove([imagePath]);
      return { ok: false, status: 500, error: `Erro ao reutilizar importação: ${updErr.message}` };
    }
    importId = same.id as string;
  } else {
    const { data: created, error: insErr } = await access.supabase
      .from("game_sheet_imports")
      .insert({
        event_id: game.id,
        team_id: null,
        created_by: access.user.id,
        status: "processing",
        image_path: imagePath,
        image_sha256: hash,
        image_mime: mime,
        model: visionConfig().model,
        source_submission_id: opts.sourceSubmissionId ?? null,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      if (!opts.existingPath) await admin.storage.from(BUCKET).remove([imagePath]);
      if (insErr?.code === "23505") return { ok: false, status: 409, error: "Já existe uma análise em curso para este jogo. Aguarde." };
      return { ok: false, status: 500, error: `Erro ao criar importação: ${insErr?.message ?? "desconhecido"}` };
    }
    importId = created.id as string;
  }

  const run = await runAndStore(access, importId, buffer, game, 0);
  return { ok: true, import_id: importId, analysis_error: run.ok ? null : run.error ?? null };
}

/** Analisa uma folha concreta do jogo (importação existente ou foto de uma submissão). */
export async function analyzeSheetCandidate(
  access: Access,
  admin: AdminClient,
  game: GameInfo,
  target: { kind: "import" | "submission"; id: string; force?: boolean },
): Promise<AnalyzeOutcome> {
  if (target.kind === "import") {
    const row = await loadImport(access, target.id);
    if (!row || row.event_id !== game.id) return { ok: false, status: 404, error: "Importação não encontrada" };
    const analyzed = row.status !== "failed" && row.status !== "processing" && row.sheet_data != null;
    if (analyzed && !target.force) return { ok: true, import_id: row.id, analysis_error: null, skipped: true };
    if (row.status === "published" || row.status === "confirmed") {
      return { ok: false, status: 409, error: "Este boletim já foi confirmado/aplicado — carregue uma nova folha em vez de o reanalisar." };
    }
    const r = await reanalyzeImport(access, row, game);
    return r.ok ? { ok: true, import_id: row.id, analysis_error: r.error ?? null } : r;
  }

  const { data: sub } = await admin
    .from("result_submissions")
    .select("id, event_id, photo_url")
    .eq("id", target.id)
    .maybeSingle();
  if (!sub || sub.event_id !== game.id) return { ok: false, status: 404, error: "Submissão não encontrada" };
  const loc = resolveSheetLocation(sub.photo_url as string | null);
  if (!loc) return { ok: false, status: 404, error: "Esta submissão não tem folha de jogo" };

  const { data: blob, error: dlErr } = await admin.storage.from(loc.bucket).download(loc.path);
  if (dlErr || !blob) return { ok: false, status: 404, error: "Folha de jogo indisponível no armazenamento" };
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mime = sniffImageMime(buffer);
  if (!mime) return { ok: false, status: 415, error: "O ficheiro da folha não é suportado (use JPEG, PNG, WebP ou PDF)." };

  return createAndAnalyze(access, admin, game, buffer, mime, {
    existingPath: loc.bucket === BUCKET ? loc.path : undefined,
    sourceSubmissionId: sub.id as string,
  });
}

