import { NextResponse, type NextRequest } from "next/server";
import { authorizeMaster } from "@/lib/auth/master";
import { findLeagueTeamIdForClubName } from "@/lib/auth/club-league-autolink";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// PATCH /api/master/clubs/:id { active?, name?, league_team_id? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const m = await authorizeMaster();
  if (!m.ok) return m.response;
  const { id } = await params;

  let body: { active?: boolean; name?: string; league_team_id?: string | null; league_name?: string | null; league_url?: string | null; ai_monthly_budget_eur?: number };
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
  // Ativar um clube da Liga INATEL: se ainda não tem equipa nem outra liga, associa a equipa com o mesmo nome
  // para que o calendário da Liga apareça logo (espelho). Não toca em associações já feitas pelo Master Admin.
  else if (body.active === true && body.league_url === undefined) {
    const { data: cur } = await m.admin
      .from("clubs").select("name, league_team_id, league_url").eq("id", id).maybeSingle();
    if (cur && !cur.league_team_id && !cur.league_url?.trim()) {
      const teamId = await findLeagueTeamIdForClubName(m.admin, String(upd.name ?? cur.name));
      if (teamId) upd.league_team_id = teamId;
    }
  }
  // Outra liga (fora da Liga INATEL): nome + endereço do site. Vazio = usar a Liga INATEL (se houver equipa associada).
  if (body.league_url !== undefined) {
    const url = body.league_url?.trim() || null;
    if (url && !/^https?:\/\/\S+$/i.test(url)) return fail("Endereço da liga inválido (tem de começar por http:// ou https://)");
    upd.league_url = url;
    if (!url) upd.league_name = null;
  }
  if (body.league_name !== undefined && upd.league_url !== null) upd.league_name = body.league_name?.trim() || null;

  const { data: club, error } = await m.admin
    .from("clubs").update(upd).eq("id", id)
    .select("id, name, slug, active, league_team_id, league_name, league_url").maybeSingle();
  if (error) return error.code === "23505" ? fail("Equipa da Liga já associada a outro clube", 409) : fail(error.message, 500);
  if (!club) return fail("Clube não encontrado", 404);
  return NextResponse.json({ club });
}
