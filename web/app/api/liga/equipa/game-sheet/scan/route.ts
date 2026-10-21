import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "game-sheets";
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-flash";

const SYSTEM_PROMPT = `És um assistente especializado em ler folhas de jogo oficiais de basquetebol da Liga INATEL.
Dado a imagem de uma folha de jogo, extrai:
- home_score: pontuação final da equipa da casa (número inteiro)
- away_score: pontuação final da equipa visitante (número inteiro)
- home_team: nome da equipa da casa (string)
- away_team: nome da equipa visitante (string)
- periods: array com parciais por período [{home, away}] se legível

Responde APENAS com JSON válido no formato:
{"home_team":"...","away_team":"...","home_score":0,"away_score":0,"periods":[]}

Se não conseguires ler algum campo, usa null para esse campo.`;

// POST /api/liga/equipa/game-sheet/scan
// Upload da foto + OCR via DeepSeek Vision
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

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Payload inválido" }, { status: 400 }); }

  const file = formData.get("photo") as File | null;
  if (!file) return NextResponse.json({ error: "Campo 'photo' não encontrado" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Formato não suportado (use JPEG, PNG ou WebP)" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 10 MB)" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const photoPath = `${user.id}/${Date.now()}.${ext}`;

  // Upload para storage (RLS: team_member_upload_game_sheet)
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(photoPath, buffer, { contentType: file.type, upsert: false });
  if (uploadErr)
    return NextResponse.json({ error: `Erro no upload: ${uploadErr.message}` }, { status: 500 });

  // Gerar URL assinado para passar ao DeepSeek (válido 5 min)
  const { data: signedData, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photoPath, 300);
  if (signErr || !signedData?.signedUrl)
    return NextResponse.json({ error: "Erro ao gerar URL da imagem" }, { status: 500 });

  // Chamar DeepSeek Vision
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "DEEPSEEK_API_KEY não configurada" }, { status: 500 });

  let extracted: {
    home_team: string | null;
    away_team: string | null;
    home_score: number | null;
    away_score: number | null;
    periods: { home: number; away: number }[];
  } | null = null;

  try {
    const dsRes = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: signedData.signedUrl },
              },
              { type: "text", text: SYSTEM_PROMPT },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 512,
      }),
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text();
      return NextResponse.json(
        { error: `DeepSeek API error ${dsRes.status}: ${errText}` },
        { status: 502 }
      );
    }

    const dsJson = await dsRes.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = dsJson.choices?.[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      extracted = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Erro ao processar imagem: ${String(e)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    photo_path: photoPath,
    home_team: extracted?.home_team ?? null,
    away_team: extracted?.away_team ?? null,
    home_score: extracted?.home_score ?? null,
    away_score: extracted?.away_score ?? null,
    periods: extracted?.periods ?? [],
  });
}
