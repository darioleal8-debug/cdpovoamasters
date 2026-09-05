import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";

export const runtime = "nodejs";

// POST /api/finance/entries/sync-cotas
// Cria entradas financeiras para pagamentos de cotas "paid" ainda não sincronizados
export async function POST(req: NextRequest) {
  const auth = await requireFinanceAccess();
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;

  const body = await req.json().catch(() => ({}));
  const season_id = body.season_id ?? null;

  // Buscar pagamentos paid cujo player_payment_id ainda não existe em financial_entries
  // players.name foi removido na migration 041 — enriquecer com v_roster abaixo
  let q = admin
    .from("player_payments")
    .select("id, amount, payment_date, player_id, season_id")
    .eq("status", "paid");
  if (season_id) q = q.eq("season_id", season_id);
  const { data: payments, error: pErr } = await q;
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // IDs já existentes em financial_entries
  const { data: existing } = await admin
    .from("financial_entries")
    .select("player_payment_id")
    .not("player_payment_id", "is", null);
  const syncedIds = new Set((existing ?? []).map((e) => e.player_payment_id));

  const toInsert = (payments ?? []).filter((p) => !syncedIds.has(p.id));
  if (toInsert.length === 0) return NextResponse.json({ synced: 0 });

  // Enriquecer com nomes via v_roster
  const playerIds = [...new Set(toInsert.map((p) => p.player_id))];
  const { data: rosterRows } = await admin
    .from("v_roster").select("player_id, name").in("player_id", playerIds);
  const nameById = new Map((rosterRows ?? []).map((r) => [r.player_id as string, r.name as string]));

  const rows = toInsert.map((p) => {
    const name = nameById.get(p.player_id) ?? null;
    return {
      amount:            Number(p.amount),
      description:       `Cota — ${name ?? "Jogador"}`,
      category:          "cota",
      source_type:       "cota_jogador",
      player_payment_id: p.id,
      player_id:         p.player_id,
      player_name:       name,
      entry_date:        p.payment_date ?? new Date().toISOString().split("T")[0],
      season_id:         p.season_id,
      created_by:        userId,
    };
  });

  const { error: insErr } = await admin.from("financial_entries").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ synced: rows.length });
}
