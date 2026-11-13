import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// PATCH /api/master/clubs/:id { active?, name?, league_team_id? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { id } = await params;

  let body: { active?: boolean; name?: string; league_team_id?: string | null; ai_monthly_budget_eur?: number };
  try { body = await req.json(); } catch { return fail("JSON inválido"); }

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.active === "boolean") upd.active = body.active;
  if (body.name !== undefined) {
    if (!body.name.trim()) return fail("Nome inválido");
    upd.name = body.name.trim();
  }
  if (body.ai_monthly_budget_eur !== undefined) {
    const v = Number(body.ai_monthly_budget_eur);
    if (!Number.isFinite(v) || v < 0 || v > 1000) return fail("Limite de IA inválido");
    upd.ai_monthly_budget_eur = v;
  }
  if (body.league_team_id !== undefined) upd.league_team_id = body.league_team_id || null;

  const { data: club, error } = await m.admin
    .from("clubs").update(upd).eq("id", id)
    .select("id, name, slug, active, league_team_id").maybeSingle();
  if (error) return error.code === "23505" ? fail("Equipa da Liga já associada a outro clube", 409) : fail(error.message, 500);
  if (!club) return fail("Clube não encontrado", 404);
  return NextResponse.json({ club });
}
