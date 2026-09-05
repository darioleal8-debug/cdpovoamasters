import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";

function fail(msg: string, status = 400) {
  return NextResponse.json({ success: false, error: msg }, { status });
}
function ok(msg: string) {
  return NextResponse.json({ success: true, message: msg });
}

// Rate-limit: máx 3 pedidos por IP em 24 h
async function checkRateLimit(supabase: Awaited<ReturnType<typeof createAdminClient>>, ipHash: string): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  return (count ?? 0) < 3;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("Body inválido", 400);
  }

  // ── Honeypot ────────────────────────────────────────────────────────────────
  // Campo "website" é oculto — se preenchido é um bot, responde 200 silencioso
  if (body.website) {
    return ok("Pedido recebido.");
  }

  // ── Validação ────────────────────────────────────────────────────────────────
  const required = ["club_name","city","category","league","player_count","contact_name","contact_role","email"];
  for (const field of required) {
    if (!body[field]) return fail(`Campo obrigatório em falta: ${field}`);
  }

  const email = String(body.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Email inválido");
  }

  const playerCount = Number(body.player_count);
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 200) {
    return fail("Número de jogadores inválido");
  }

  const validCategories = ["+40", "+50", "outro"];
  if (!validCategories.includes(String(body.category))) {
    return fail("Escalão inválido");
  }

  const validRoles = ["dirigente", "treinador", "jogador-organizador"];
  if (!validRoles.includes(String(body.contact_role))) {
    return fail("Papel inválido");
  }

  // ── Rate-limit por IP ────────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

  const supabase = await createAdminClient();
  const allowed = await checkRateLimit(supabase, ipHash);
  if (!allowed) {
    return fail("Demasiados pedidos. Tenta novamente amanhã.", 429);
  }

  // ── Inserção ─────────────────────────────────────────────────────────────────
  const { error } = await supabase.from("access_requests").insert({
    club_name:    String(body.club_name).trim(),
    city:         String(body.city).trim(),
    category:     String(body.category),
    league:       String(body.league).trim(),
    player_count: playerCount,
    contact_name: String(body.contact_name).trim(),
    contact_role: String(body.contact_role),
    email,
    phone:        body.phone ? String(body.phone).trim() : null,
    ip_hash:      ipHash,
    honeypot:     null,
    status:       "pendente",
  });

  if (error) {
    console.error("[request-access]", error);
    return fail("Erro interno. Tenta novamente.", 500);
  }

  return ok("Pedido recebido. Falamos contigo em 48 horas.");
}
