import { NextResponse } from "next/server";
import { authorizeGameSheet, BUCKET, importView, isUuid, jsonError, loadGameForAccess, loadImport } from "@/lib/game-sheet/service";
import { MAX_REQUEST_BYTES, sha256, sniffImageMime } from "@/lib/game-sheet/image";
import { runAndStore } from "@/lib/game-sheet/run";
import { visionConfig } from "@/lib/game-sheet/vision";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMPORTS_PER_HOUR = Number(process.env.GAME_SHEET_MAX_IMPORTS_PER_HOUR ?? 15);
/** Uma importação em 'processing' há mais do que isto é considerada abandonada (função terminou a meio). */
const STALE_PROCESSING_MS = 3 * 60 * 1000;

/** Importar boletim de jogo com IA: carrega a foto, interpreta-a e cria o rascunho para revisão. */
export async function POST(req: Request) {
  const auth = await authorizeGameSheet();
  if (!auth.ok) return auth.response;
  const { access } = auth;
  if (!access.teamId) return jsonError("Só delegados de equipa podem importar boletins", 403);

  if (!process.env.DEEPSEEK_API_KEY) return jsonError("Leitura automática indisponível (DEEPSEEK_API_KEY não configurada)", 503);

  let form: FormData;
  try { form = await req.formData(); } catch { return jsonError("Payload inválido", 400); }

  const file = form.get("photo");
  const gameId = form.get("game_id");
  if (!(file instanceof File)) return jsonError("Campo 'photo' em falta", 400);
  if (!isUuid(gameId)) return jsonError("Jogo inválido", 400);
  if (file.size === 0 || file.size > MAX_REQUEST_BYTES) {
    return jsonError(`Ficheiro vazio ou demasiado grande (máx. ${MAX_REQUEST_BYTES / 1024 / 1024} MB após compressão)`, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageMime(buffer); // tipo real, não o declarado pelo cliente
  if (!mime) return jsonError("Formato não suportado. Use JPEG, PNG ou WebP.", 400);

  const game = await loadGameForAccess(access, gameId);
  if (!game) return jsonError("Jogo não encontrado ou não pertence à sua equipa", 404);

  const hash = sha256(buffer);
  const { supabase, user } = access;

  // Idempotência: mesma imagem para o mesmo jogo → devolve o rascunho existente
  const { data: same } = await supabase
    .from("game_sheet_imports")
    .select("id")
    .eq("event_id", game.id)
    .eq("image_sha256", hash)
    .neq("status", "failed")
    .maybeSingle();
  if (same) {
    const row = await loadImport(access, same.id as string);
    if (row) return NextResponse.json({ ...(await importView(access, row, game)), reused: true });
  }

  // Limite de pedidos por utilizador (controlo de custos)
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("game_sheet_imports")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_IMPORTS_PER_HOUR) {
    return jsonError("Limite de importações por hora atingido. Tente mais tarde.", 429);
  }

  // Liberta bloqueios abandonados antes de tentar criar o novo
  await supabase
    .from("game_sheet_imports")
    .update({ status: "failed", error: "Processamento interrompido", updated_at: new Date().toISOString() })
    .eq("event_id", game.id)
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - STALE_PROCESSING_MS).toISOString());

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const imagePath = `${user.id}/${new Date().getFullYear()}/${game.id}/${hash}.${ext}`;

  const { data: created, error: insErr } = await supabase
    .from("game_sheet_imports")
    .insert({
      event_id: game.id,
      team_id: access.teamId,
      created_by: user.id,
      status: "processing",
      image_path: imagePath,
      image_sha256: hash,
      image_mime: mime,
      model: visionConfig().model,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    if (insErr?.code === "23505") return jsonError("Já existe uma análise em curso para este jogo. Aguarde.", 409);
    return jsonError(`Erro ao criar importação: ${insErr?.message ?? "desconhecido"}`, 500);
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(imagePath, buffer, { contentType: mime, upsert: false });
  if (upErr && !/exists|duplicate/i.test(upErr.message)) {
    await supabase.from("game_sheet_imports").update({ status: "failed", error: "Falha no upload da imagem" }).eq("id", created.id);
    return jsonError(`Erro no upload: ${upErr.message}`, 500);
  }

  const run = await runAndStore(access, created.id as string, buffer, game, 0);
  const row = await loadImport(access, created.id as string);
  if (!row) return jsonError("Importação não encontrada após análise", 500);

  return NextResponse.json(
    { ...(await importView(access, row, game)), analysis_error: run.ok ? null : run.error, analysis_error_kind: run.kind ?? null },
    { status: 201 },
  );
}
