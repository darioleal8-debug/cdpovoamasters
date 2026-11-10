import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getCompetitionBySlug, getCompetitionGames } from "@/lib/competitions-data";
import { makeSender } from "@/lib/liga/push/send";
import { runLigaPushes } from "@/lib/liga/push/dispatch";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Chamado de minuto a minuto pelo pg_cron (Supabase) com LIGA_PUSH_SECRET; aceita também o CRON_SECRET da Vercel. */
function hasPushSecret(req: NextRequest): boolean {
  const secret = process.env.LIGA_PUSH_SECRET?.trim();
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req) && !hasPushSecret(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const db = await createAdminClient();
  const competition = await getCompetitionBySlug("liga-inatel");
  if (!competition?.season_id) return NextResponse.json({ ok: true, planned: 0 });
  const games = await getCompetitionGames(competition.competition_key ?? "Liga", competition.season_id);
  const report = await runLigaPushes(db, makeSender(db), games);
  if (report.errors.length) console.error("[cron/liga-push]", report.errors);
  return NextResponse.json({ ok: report.errors.length === 0, ...report });
}
