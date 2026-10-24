import { after } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { generateLigaNews } from "@/lib/liga/generate-news";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { action, rejection_reason, motivo } = (await req.json()) as {
    action: "approve" | "reject";
    rejection_reason?: string;
    motivo: string;
  };

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action deve ser 'approve' ou 'reject'" }, { status: 400 });
  }
  if (!motivo?.trim()) {
    return NextResponse.json({ error: "motivo obrigatório" }, { status: 400 });
  }

  const adminClient = await createAdminClient();

  const { data: sub } = await adminClient
    .from("result_submissions")
    .select("*")
    .eq("id", id)
    .single();

  if (!sub) return NextResponse.json({ error: "Submissão não encontrada" }, { status: 404 });

  const now = new Date().toISOString();

  // Atualizar status da submissão + campos de revisão
  await adminClient
    .from("result_submissions")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_at: now,
      reviewed_by: auth.user.id,
      rejection_reason: action === "reject" ? (rejection_reason?.trim() || motivo.trim()) : null,
    })
    .eq("id", id);

  if (action === "approve") {
    // Obter competition_id
    const { data: comp } = await adminClient
      .from("competitions")
      .select("id")
      .eq("slug", "liga-inatel")
      .single();

    const currentRes = await adminClient
      .from("league_game_results")
      .select("home_score, away_score")
      .eq("event_id", sub.event_id)
      .maybeSingle();

    // UPSERT resultado oficial com approved_by
    await adminClient
      .from("league_game_results")
      .upsert({
        event_id: sub.event_id,
        competition_id: comp?.id ?? sub.competition_id,
        home_team_name: sub.home_team_name,
        away_team_name: sub.away_team_name,
        home_score: sub.home_score,
        away_score: sub.away_score,
        approved_at: now,
        approved_by: auth.user.id,
      }, { onConflict: "event_id" });

    // Auditoria
    await adminClient.from("liga_resultado_audit").insert({
      jogo_id: sub.event_id,
      alterado_por: auth.user.id,
      valor_antigo: currentRes.data
        ? { home_score: currentRes.data.home_score, away_score: currentRes.data.away_score }
        : null,
      valor_novo: { home_score: sub.home_score, away_score: sub.away_score, source: `submission:${id}` },
      motivo: motivo.trim(),
    });

    // Verificar se é jogo de teste
    const isTestGame = await (async () => {
      try {
        const { data: ev } = await adminClient.from("events").select("description").eq("id", sub.event_id).single();
        const meta = JSON.parse(ev?.description ?? "{}") as { is_test?: boolean };
        return meta.is_test === true;
      } catch { return false; }
    })();

    if (!isTestGame) {
      const gameId = sub.event_id;
      // after() garante execução após o response, sem bloquear o admin.
      // Usa generateLigaNews diretamente (service role) — sem depender do cookie/sessão.
      after(async () => {
        const result = await generateLigaNews(gameId);
        if (!result.ok) {
          console.error(`[submissions/approve] generateLigaNews falhou para game_id=${gameId}: ${result.error}`);
        }
      });
    }
  } else {
    // Auditoria de rejeição
    await adminClient.from("liga_resultado_audit").insert({
      jogo_id: sub.event_id,
      alterado_por: auth.user.id,
      valor_antigo: { status: "pending", submission_id: id },
      valor_novo: { status: "rejected", reason: rejection_reason ?? motivo },
      motivo: motivo.trim(),
    });
  }

  revalidatePath("/liga-inatel", "layout");
  return NextResponse.json({ ok: true });
}
