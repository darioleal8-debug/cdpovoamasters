import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "folhas-jogo";
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_TYPES = [...IMAGE_TYPES, "application/pdf"];

// Endpoint sem /v1 conforme documentação actualizada
const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-flash";

const VISION_PROMPT = `Analisa esta folha de jogo oficial de basquetebol da Liga INATEL.
Extrai os dados e responde APENAS com JSON válido no seguinte formato:
{
  "equipa_casa": "nome completo da equipa da casa",
  "equipa_fora": "nome completo da equipa visitante",
  "pontos_casa": número inteiro,
  "pontos_fora": número inteiro,
  "parciais": [{"periodo": 1, "casa": num, "fora": num}, ...],
  "prolongamento": false,
  "data": "YYYY-MM-DD ou null",
  "pavilhao": "nome do pavilhão ou null",
  "arbitros": ["nome1", "nome2"],
  "jogadores": [
    {"equipa": "casa|fora", "numero": num, "nome": "...", "pontos": num, "faltas": num}
  ],
  "confianca": 0.0,
  "avisos": []
}
Se não conseguires ler um campo com confiança, usa null. Não inventes dados.`;

const TEXT_PROMPT = `Analisa o seguinte texto extraído de uma folha de jogo de basquetebol da Liga INATEL e extrai os dados estruturados.
Responde APENAS com JSON válido no seguinte formato:
{
  "equipa_casa": "nome completo da equipa da casa",
  "equipa_fora": "nome completo da equipa visitante",
  "pontos_casa": número inteiro,
  "pontos_fora": número inteiro,
  "parciais": [{"periodo": 1, "casa": num, "fora": num}, ...],
  "prolongamento": false,
  "data": "YYYY-MM-DD ou null",
  "pavilhao": "nome do pavilhão ou null",
  "arbitros": ["nome1", "nome2"],
  "jogadores": [
    {"equipa": "casa|fora", "numero": num, "nome": "...", "pontos": num, "faltas": num}
  ],
  "confianca": 0.0,
  "avisos": []
}
Texto da folha:\n\n`;

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

  // Guardar ficheiro no bucket folhas-jogo
  const epoch = new Date().getFullYear();
  const gameId = (formData.get("game_id") as string | null) ?? "unknown";
  const photoPath = `${user.id}/${epoch}/${gameId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(photoPath, buffer, { contentType: file.type, upsert: false });
  if (uploadErr)
    return NextResponse.json({ error: `Erro no upload: ${uploadErr.message}` }, { status: 500 });

  // Extrair dados via DeepSeek
  let extracted: Record<string, unknown> | null = null;

  try {
    if (file.type === "application/pdf") {
      // PDF com camada de texto → extrair com pdf-parse
      let pdfText = "";
      try {
        // pdf-parse ESM não tem .default — aceitar ambas as formas
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await import("pdf-parse") as any;
        const pdfParse: (b: Buffer) => Promise<{ text: string }> = mod.default ?? mod;
        const parsed = await pdfParse(buffer);
        pdfText = parsed.text?.trim() ?? "";
      } catch {
        pdfText = "";
      }

      if (!pdfText || pdfText.length < 50) {
        // PDF digitalizado sem texto: não consegue processar
        return NextResponse.json({
          error: "PDF digitalizado sem camada de texto. Tire uma fotografia em vez de enviar o PDF, ou exporte o PDF como imagem.",
          photo_path: photoPath,
          fallback_manual: true,
        }, { status: 422 });
      }

      const res = await fetch(DEEPSEEK_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [{ role: "user", content: TEXT_PROMPT + pdfText }],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 1024,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        return NextResponse.json({ error: `DeepSeek error ${res.status}: ${t}` }, { status: 502 });
      }
      const json = await res.json() as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "{}";
      extracted = JSON.parse(raw);

    } else {
      // Imagem → enviar como base64 ao DeepSeek Vision
      const b64 = buffer.toString("base64");
      const mimeType = file.type as "image/jpeg" | "image/png" | "image/webp";

      const res = await fetch(DEEPSEEK_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } },
                { type: "text", text: VISION_PROMPT },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 1024,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        return NextResponse.json({ error: `DeepSeek error ${res.status}: ${t}` }, { status: 502 });
      }
      const json = await res.json() as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "{}";
      extracted = JSON.parse(raw);
    }
  } catch (e) {
    // OCR falhou, mas o ficheiro foi guardado — retornar photo_path para o delegado preencher manualmente
    return NextResponse.json({
      error: `Erro ao processar: ${String(e)}`,
      photo_path: photoPath,
      fallback_manual: true,
    }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    photo_path: photoPath,
    equipa_casa: extracted?.equipa_casa ?? null,
    equipa_fora: extracted?.equipa_fora ?? null,
    pontos_casa: extracted?.pontos_casa ?? null,
    pontos_fora: extracted?.pontos_fora ?? null,
    parciais: extracted?.parciais ?? [],
    confianca: extracted?.confianca ?? 0,
    avisos: extracted?.avisos ?? [],
    extraction_raw: extracted,
  });
}
