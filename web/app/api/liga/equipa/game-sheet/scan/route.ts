import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateQuarters, penalizeConfidence } from "@/lib/liga/game-sheet-scan";
import type { ScanExtraction, QuarterScore, PlayerScan } from "@/lib/liga/game-sheet-scan";
import { deepseekJSON } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "folhas-jogo";
const MAX_SIZE = 15 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_TYPES = [...IMAGE_TYPES, "application/pdf"];

// ── DeepSeek helper ──────────────────────────────────────────────────────────

type ScanContent = string | { type: string; [key: string]: unknown }[];

async function callAndParse(
  userContent: ScanContent,
  label: string,
): Promise<{ data: Record<string, unknown>; reason?: string }> {
  const result = await deepseekJSON<Record<string, unknown>>({
    user: userContent,
    maxTokens: 4096,
    temperature: 0,
    model: process.env.DEEPSEEK_VISION_MODEL ?? "deepseek-flash",
  });

  if (!result.ok) {
    console.error(`[game-sheet/scan] ${label} failed: ${result.error}`);
    return { data: {}, reason: result.error };
  }

  return { data: result.data };
}

// ── Buscar nomes das equipas a partir do game_id ─────────────────────────────

async function fetchTeamNames(
  gameId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ home: string | null; away: string | null }> {
  try {
    const { data } = await supabase
      .from("events")
      .select("description, title")
      .eq("id", gameId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { home: null, away: null };
    const meta = JSON.parse(data.description ?? "{}") as { home_team?: string; away_team?: string };
    return { home: meta.home_team ?? null, away: meta.away_team ?? null };
  } catch {
    return { home: null, away: null };
  }
}

// ── Prompts ──────────────────────────────────────────────────────────────────

function makeScoresPrompt(homeTeam: string | null, awayTeam: string | null): string {
  const context = homeTeam && awayTeam
    ? `\nEste jogo é ${homeTeam} (equipa da casa) vs ${awayTeam} (equipa visitante).`
    : "";

  return `Analisa esta folha de jogo oficial de basquetebol da Liga INATEL (normalmente manuscrita, modelo FIBA).${context}

Extrai APENAS: resultado final e parciais por período. Responde EXCLUSIVAMENTE com JSON válido:
{
  "equipa_casa": "nome",
  "equipa_fora": "nome",
  "pontos_casa": 80,
  "pontos_fora": 72,
  "parciais": [{"periodo": 1, "casa": 20, "fora": 18}, ...],
  "prolongamento": false,
  "data": "YYYY-MM-DD ou null",
  "pavilhao": "nome ou null",
  "arbitros": ["nome1"],
  "confianca": 0.9,
  "avisos": []
}
Se não conseguires ler um campo com confiança, usa null. Não inventes dados.`;
}

const PLAYERS_PROMPT = `Da mesma folha de jogo, extrai agora a lista de jogadores.
ATENÇÃO: a pontuação individual pode não estar escrita directamente — pode ser necessário deduzir da coluna de marcação corrida (running score) cruzando com o número do jogador.
Responde EXCLUSIVAMENTE com JSON válido:
{
  "jogadores": [
    {"equipa": "casa|fora", "numero": 7, "nome": "Nome Apelido", "pontos": 12, "faltas": 3, "lances_livres": 2, "triplos": 1}
  ]
}
Se não conseguires ler, usa null nos campos numéricos. Não inventes dados.`;

function makeTextPrompt(text: string, homeTeam: string | null, awayTeam: string | null): string {
  const context = homeTeam && awayTeam
    ? `\nEste jogo é ${homeTeam} (casa) vs ${awayTeam} (fora).`
    : "";
  return `Analisa o seguinte texto de uma folha de jogo de basquetebol da Liga INATEL.${context}
Responde EXCLUSIVAMENTE com JSON válido:
{
  "equipa_casa": "nome",
  "equipa_fora": "nome",
  "pontos_casa": 80,
  "pontos_fora": 72,
  "parciais": [{"periodo": 1, "casa": 20, "fora": 18}],
  "prolongamento": false,
  "data": "YYYY-MM-DD ou null",
  "pavilhao": "nome ou null",
  "arbitros": [],
  "jogadores": [{"equipa": "casa|fora", "numero": 7, "nome": "...", "pontos": 12, "faltas": 3}],
  "confianca": 0.9,
  "avisos": []
}
Texto:\n\n${text}`;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: membership } = await supabase
    .from("league_team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Sem acesso de equipa" }, { status: 403 });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "DEEPSEEK_API_KEY não configurada" }, { status: 500 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }

  const file = formData.get("photo") as File | null;
  if (!file) return NextResponse.json({ error: "Campo 'photo' não encontrado" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: `Tipo não suportado: ${file.type}. Use JPEG, PNG, WebP ou PDF.` }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: `Ficheiro demasiado grande (máx. ${MAX_SIZE / 1024 / 1024} MB)` }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "application/pdf" ? "pdf"
    : file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : "jpg";

  // Upload para o bucket
  const epoch = new Date().getFullYear();
  const gameId = (formData.get("game_id") as string | null) ?? "unknown";
  const photoPath = `${user.id}/${epoch}/${gameId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(photoPath, buffer, { contentType: file.type, upsert: false });
  if (uploadErr)
    return NextResponse.json({ error: `Erro no upload: ${uploadErr.message}` }, { status: 500 });

  // Buscar nomes das equipas para enriquecer o prompt
  const { home: homeTeam, away: awayTeam } = await fetchTeamNames(gameId, supabase);

  // ── Extracção ─────────────────────────────────────────────────────────────

  let extraction: Partial<ScanExtraction> = {};
  let globalReason: string | undefined;

  try {
    if (file.type === "application/pdf") {
      // PDF com camada de texto
      let pdfText = "";
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await import("pdf-parse") as any;
        const pdfParse: (b: Buffer) => Promise<{ text: string }> = mod.default ?? mod;
        pdfText = (await pdfParse(buffer)).text?.trim() ?? "";
      } catch { pdfText = ""; }

      if (!pdfText || pdfText.length < 50) {
        return NextResponse.json({
          error: "PDF digitalizado sem camada de texto. Tire uma fotografia em vez de enviar o PDF.",
          reason: "pdf_sem_texto",
          photo_path: photoPath,
          fallback_manual: true,
        }, { status: 422 });
      }

      const { data, reason } = await callAndParse(
        makeTextPrompt(pdfText, homeTeam, awayTeam),
        "pdf",
      );
      if (reason) globalReason = reason;
      extraction = data as Partial<ScanExtraction>;

    } else {
      // Imagem — 2 chamadas separadas
      const b64 = buffer.toString("base64");
      const mimeType = file.type as "image/jpeg" | "image/png" | "image/webp";
      const dataUrl = `data:${mimeType};base64,${b64}`;

      // Chamada A: resultado + parciais (obrigatória)
      const { data: scoresData, reason: scoresReason } = await callAndParse(
        [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: makeScoresPrompt(homeTeam, awayTeam) },
        ],
        "scores",
      );

      if (scoresReason) {
        globalReason = scoresReason;
        extraction = {};
      } else {
        extraction = scoresData as Partial<ScanExtraction>;

        // Chamada B: jogadores (opcional — falha silenciosa)
        try {
          const { data: playersData, reason: playersReason } = await callAndParse(
            [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: PLAYERS_PROMPT },
            ],
            "players",
          );
          if (!playersReason && Array.isArray(playersData.jogadores)) {
            extraction.jogadores = playersData.jogadores as PlayerScan[];
          }
        } catch (e) {
          console.error("[game-sheet/scan] players call failed (non-blocking):", String(e));
        }
      }
    }
  } catch (e) {
    console.error("[game-sheet/scan] unexpected error:", String(e));
    return NextResponse.json({
      error: `Erro ao processar: ${String(e)}`,
      reason: "erro_inesperado",
      photo_path: photoPath,
      fallback_manual: true,
    }, { status: 422 });
  }

  if (globalReason) {
    return NextResponse.json({
      error: "Não foi possível ler a folha automaticamente — preenche manualmente.",
      reason: globalReason,
      photo_path: photoPath,
      fallback_manual: true,
    }, { status: 422 });
  }

  // Validação dos parciais
  const parciais = (extraction.parciais ?? []) as QuarterScore[];
  const homeFinal = (extraction.pontos_casa ?? 0) as number;
  const awayFinal = (extraction.pontos_fora ?? 0) as number;

  const quarterWarnings = validateQuarters(parciais, homeFinal, awayFinal);
  const avisos = [...(extraction.avisos ?? []), ...quarterWarnings];
  const confianca = penalizeConfidence((extraction.confianca ?? 0) as number, quarterWarnings);

  return NextResponse.json({
    ok: true,
    photo_path: photoPath,
    equipa_casa:  extraction.equipa_casa  ?? homeTeam ?? null,
    equipa_fora:  extraction.equipa_fora  ?? awayTeam ?? null,
    pontos_casa:  extraction.pontos_casa  ?? null,
    pontos_fora:  extraction.pontos_fora  ?? null,
    parciais,
    prolongamento: extraction.prolongamento ?? false,
    jogadores:    extraction.jogadores    ?? [],
    arbitros:     extraction.arbitros     ?? [],
    data:         extraction.data         ?? null,
    pavilhao:     extraction.pavilhao     ?? null,
    confianca,
    avisos,
    extraction_raw: extraction,
  });
}
