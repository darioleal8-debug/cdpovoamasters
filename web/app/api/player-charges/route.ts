import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { FINANCE } from "@/lib/auth/roles";
import { clubIdForUser } from "@/lib/auth/club";
import { createAdminClient } from "@/lib/supabase/server";
import { ChargeUpsertSchema, normalizeCharge } from "@/lib/payments/types";

export const runtime = "nodejs";

const COLUMNS = "id, season_id, player_id, payment_type_id, amount_due, amount, status, method, notes, payment_date";

function shape<T extends { amount: unknown; amount_due: unknown }>(r: T) {
  return { ...r, amount: Number(r.amount), amount_due: Number(r.amount_due) };
}

// GET /api/player-charges?season_id=&type_id= — registos do clube do utilizador.
export async function GET(req: NextRequest) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const seasonId = req.nextUrl.searchParams.get("season_id");
  const typeId = req.nextUrl.searchParams.get("type_id");
  if (!seasonId) return NextResponse.json({ error: "season_id obrigatório" }, { status: 400 });

  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ charges: [] });

  const db = await createAdminClient();
  let q = db.from("player_charges").select(COLUMNS).eq("club_id", clubId).eq("season_id", seasonId);
  if (typeId) q = q.eq("payment_type_id", typeId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ charges: (data ?? []).map(shape) });
}

// POST /api/player-charges — regista/atualiza o pagamento de um jogador num tipo, numa época (admin / tesoureiro).
export async function POST(req: NextRequest) {
  const auth = await authorize(FINANCE);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const parsed = ChargeUpsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const v = parsed.data;

  const clubId = await clubIdForUser(auth.supabase, auth.user.id);
  if (!clubId) return NextResponse.json({ error: "Conta sem clube ativo." }, { status: 403 });

  const db = await createAdminClient();

  // Época e tipo têm de ser do clube do utilizador (nunca de outro clube)
  const [{ data: season }, { data: type }] = await Promise.all([
    db.from("seasons").select("id").eq("id", v.season_id).eq("club_id", clubId).maybeSingle(),
    db.from("payment_types").select("id").eq("id", v.payment_type_id).eq("club_id", clubId).eq("active", true).maybeSingle(),
  ]);
  if (!season) return NextResponse.json({ error: "Temporada não encontrada." }, { status: 404 });
  if (!type) return NextResponse.json({ error: "Tipo de pagamento não encontrado." }, { status: 404 });

  // Resolver o jogador desta época (cria o perfil se o utilizador ainda não o tem)
  let playerId = v.player_id ?? null;
  if (playerId) {
    const { data: p } = await db.from("players").select("id").eq("id", playerId).eq("season_id", v.season_id).eq("club_id", clubId).maybeSingle();
    if (!p) return NextResponse.json({ error: "Jogador não encontrado nesta temporada." }, { status: 404 });
  } else if (v.user_id) {
    // `users` só devolve membros do clube do pedido
    const { data: member } = await db.from("users").select("id").eq("id", v.user_id).maybeSingle();
    if (!member) return NextResponse.json({ error: "Jogador não encontrado no clube." }, { status: 404 });
    const { data: existing } = await db.from("players").select("id").eq("user_id", v.user_id).eq("season_id", v.season_id).eq("club_id", clubId).maybeSingle();
    if (existing) {
      playerId = existing.id as string;
    } else {
      const { data: created, error: createErr } = await db
        .from("players").insert({ user_id: v.user_id, season_id: v.season_id, club_id: clubId }).select("id").single();
      if (createErr) return NextResponse.json({ error: `Não foi possível criar o perfil de jogador: ${createErr.message}` }, { status: 500 });
      playerId = created!.id as string;
    }
  }
  if (!playerId) return NextResponse.json({ error: "player_id ou user_id são obrigatórios" }, { status: 400 });

  const { data, error } = await db
    .from("player_charges")
    .upsert(
      {
        club_id: clubId,
        season_id: v.season_id,
        player_id: playerId,
        payment_type_id: v.payment_type_id,
        created_by: auth.user.id,
        ...normalizeCharge(v),
      },
      { onConflict: "season_id,player_id,payment_type_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ charge: shape(data) }, { status: 201 });
}
