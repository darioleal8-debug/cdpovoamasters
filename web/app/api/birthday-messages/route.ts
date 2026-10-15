import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getYearLisbon } from "@/lib/birthday-utils";

export const runtime = "nodejs";

export interface BirthdayMessage {
  id:                  string;
  celebrant_player_id: string;
  celebration_year:    number;
  author_user_id:      string;
  author_name:         string;
  author_photo_url:    string | null;
  message:             string;
  is_thank_you:        boolean;
  is_hidden:           boolean;
  created_at:          string;
  updated_at:          string;
}

// GET /api/birthday-messages?player_id=&year=
export async function GET(req: NextRequest) {
  const sp       = req.nextUrl.searchParams;
  const playerId = sp.get("player_id");
  const year     = parseInt(sp.get("year") ?? String(getYearLisbon()), 10);

  if (!playerId) return NextResponse.json({ error: "player_id obrigatório" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // RLS handles visibility (hidden messages filtered for non-admins)
  const { data: rows, error } = await supabase
    .from("birthday_messages")
    .select("id, celebrant_player_id, celebration_year, author_user_id, message, is_thank_you, is_hidden, created_at, updated_at")
    .eq("celebrant_player_id", playerId)
    .eq("celebration_year", year)
    .order("is_thank_you", { ascending: false }) // thank-you first
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = rows ?? [];

  // Fetch author names + photos
  const authorIds = [...new Set(messages.map((m) => m.author_user_id as string))];
  const { data: authorUsers } = await supabase
    .from("users")
    .select("id, name, photo_url")
    .in("id", authorIds);
  const authorMap = new Map((authorUsers ?? []).map((u) => [u.id as string, u]));

  const enriched: BirthdayMessage[] = messages.map((m) => {
    const a = authorMap.get(m.author_user_id as string);
    return {
      id:                  m.id as string,
      celebrant_player_id: m.celebrant_player_id as string,
      celebration_year:    m.celebration_year as number,
      author_user_id:      m.author_user_id as string,
      author_name:         (a?.name as string) ?? "Membro",
      author_photo_url:    (a?.photo_url as string | null) ?? null,
      message:             m.message as string,
      is_thank_you:        m.is_thank_you as boolean,
      is_hidden:           m.is_hidden as boolean,
      created_at:          m.created_at as string,
      updated_at:          m.updated_at as string,
    };
  });

  return NextResponse.json({ messages: enriched, current_user_id: user.id });
}

// POST /api/birthday-messages — create or update own message
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: {
    celebrant_player_id?: string;
    celebration_year?:    number;
    message?:             string;
    is_thank_you?:        boolean;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { celebrant_player_id, celebration_year, message, is_thank_you = false } = body;

  if (!celebrant_player_id || !message) {
    return NextResponse.json({ error: "celebrant_player_id e message são obrigatórios" }, { status: 400 });
  }
  if (message.length < 1 || message.length > 280) {
    return NextResponse.json({ error: "Mensagem entre 1 e 280 caracteres" }, { status: 400 });
  }

  const year = celebration_year ?? getYearLisbon();

  // Upsert — RLS checks author, window and is_thank_you constraint
  const { data, error } = await supabase
    .from("birthday_messages")
    .upsert(
      {
        celebrant_player_id,
        celebration_year: year,
        author_user_id: user.id,
        message: message.trim(),
        is_thank_you,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "celebrant_player_id,celebration_year,author_user_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: data }, { status: 201 });
}
