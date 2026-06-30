import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyActivationToken } from "@/lib/activation-token";

export const runtime = "nodejs";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

function fail(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// ─── POST /api/activate ─────────────────────────────────────
// Body: { token: string }
// Suporta tokens HMAC (auto-contidos, sem BD) e tokens hex legados (BD).
export async function POST(req: NextRequest) {
  let body: { token?: string };
  try { body = await req.json(); }
  catch { return fail("JSON inválido"); }

  const { token } = body;
  if (!token || typeof token !== "string" || token.trim().length < 10) {
    return fail("Token inválido");
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const admin = adminClient();
  const t     = token.trim();

  // ── 1. Tentar token HMAC (formato novo, sem BD) ──────────
  const hmac = verifyActivationToken(t);

  if (hmac.ok) {
    const { error } = await admin
      .from("users")
      .update({ active: true })
      .eq("id", hmac.userId);

    if (error) {
      console.error("[activate] Erro ao ativar conta:", error.message);
      return fail("Não foi possível ativar a conta. Tenta novamente.", 500);
    }

    // Marcar como usado na BD de auditoria (opcional — pode não existir)
    await admin
      .from("user_activation_tokens")
      .update({ used: true, used_at: new Date().toISOString(), ip_address: ip })
      .eq("token", t)
      .eq("used", false);

    console.log(`[activate] ✓ Conta ${hmac.userId} ativada (HMAC). IP: ${ip}`);
    return NextResponse.json({ success: true });
  }

  if (hmac.reason === "expired") {
    return fail(
      "O link de ativação expirou (válido por 24h). Pede ao administrador para gerar um novo link.",
      410
    );
  }

  // ── 2. Fallback: token hex legado na BD ──────────────────
  const { data: record, error: fetchError } = await admin
    .from("user_activation_tokens")
    .select("id, user_id, expires_at, used")
    .eq("token", t)
    .maybeSingle();

  if (fetchError) {
    // Tabela pode não existir ainda — token inválido
    return fail("Link de ativação inválido ou não encontrado.", 404);
  }

  if (!record) {
    return fail("Link de ativação inválido ou não encontrado.", 404);
  }

  if (record.used) {
    return fail(
      "Este link já foi utilizado. A conta pode já estar ativa — tenta fazer login.",
      409
    );
  }

  if (new Date(record.expires_at) < new Date()) {
    return fail(
      "O link expirou. Pede ao administrador para gerar um novo.",
      410
    );
  }

  const { error: activateError } = await admin
    .from("users")
    .update({ active: true })
    .eq("id", record.user_id);

  if (activateError) {
    return fail("Não foi possível ativar a conta.", 500);
  }

  await admin
    .from("user_activation_tokens")
    .update({ used: true, used_at: new Date().toISOString(), ip_address: ip })
    .eq("id", record.id);

  console.log(`[activate] ✓ Conta ${record.user_id} ativada (legado). IP: ${ip}`);
  return NextResponse.json({ success: true });
}
