import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

const STATUSES = ["pendente", "aceite", "recusado"] as const;
type Status = (typeof STATUSES)[number];

const COLUMNS =
  "id, club_name, city, category, league, player_count, contact_name, contact_role, email, phone, status, notes, created_at, reviewed_at";

// GET /api/master/access-requests            — todos os pedidos (mais recentes primeiro) + nº de pendentes
// GET /api/master/access-requests?summary=1  — só o nº de pendentes e os 3 mais recentes (dashboard / menu)
export async function GET(req: NextRequest) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { admin } = m;

  const { count: pending } = await admin
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");

  if (req.nextUrl.searchParams.get("summary") === "1") {
    const { data } = await admin
      .from("access_requests")
      .select("id, club_name, city, contact_name, contact_role, created_at")
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(3);
    return NextResponse.json({ pending: pending ?? 0, latest: data ?? [] });
  }

  const { data, error } = await admin
    .from("access_requests")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ pending: pending ?? 0, requests: data ?? [] });
}

// PATCH /api/master/access-requests { id, status, notes? }
export async function PATCH(req: NextRequest) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;

  let body: { id?: string; status?: string; notes?: string | null };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  if (!body.id || typeof body.id !== "string") return fail("Pedido em falta");
  if (!STATUSES.includes(body.status as Status)) return fail("Estado inválido");
  const status = body.status as Status;

  const upd: Record<string, unknown> = {
    status,
    reviewed_at: status === "pendente" ? null : new Date().toISOString(),
    reviewed_by: status === "pendente" ? null : m.user.id,
  };
  if (body.notes !== undefined) upd.notes = body.notes ? String(body.notes).trim().slice(0, 1000) || null : null;

  const { data, error } = await m.admin
    .from("access_requests")
    .update(upd)
    .eq("id", body.id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("Pedido não encontrado", 404);
  return NextResponse.json({ request: data });
}
