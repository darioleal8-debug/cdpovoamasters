import { after } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { generateLigaNews } from "@/lib/liga/generate-news";
import { generateNewsImage } from "@/lib/liga/generate-image";
import { buildApprovalPlan } from "@/lib/game-sheet/approval";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  if (sub.status !== "pending" && action === "reject") {
    return NextResponse.json({ error: "Só é possível rejeitar submissões pendentes" }, { status: 409 });
  }

  if (action === "approve") {
    // Boletim importado (se existir) — lido com a sessão do admin (RLS)
    let imp: { status: string; sheet_data: unknown } | null = null;
    if (sub.import_id) {
      const { data } = await auth.supabase
        .from("game_sheet_imports")
        .select("status, sheet_data")
        .eq("id", sub.import_id)
        .maybeSingle();
      imp = data;
    }
    const plan = buildApprovalPlan(sub, imp);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

    // Tudo numa transação: resultado, parciais, jogadores, marcha, estado da importação, auditoria
    const { error: applyErr } = await auth.supabase.rpc("liga_apply_game_sheet", {
      p_submission_id: id,
      p_motivo: motivo.trim(),
      p_payload: plan.payload,
    });
    if (applyErr) {
      console.error(`[submissions/approve] liga_apply_game_sheet falhou sub=${id}: ${applyErr.message}`);
      return NextResponse.json({ error: `Erro ao aplicar o resultado: ${applyErr.message}` }, { status: 500 });
    }

    // Verificar se é jogo de teste
    const isTestGame = await (async () => {
      try {
        const { data: ev } = await adminClient.from("events").select("description, is_test").eq("id", sub.event_id).single();
        const meta = JSON.parse(ev?.description ?? "{}") as { is_test?: boolean };
        return ev?.is_test === true || meta.is_test === true;
      } catch { return false; }
    })();

    if (!isTestGame) {
      const gameId = sub.event_id;
      after(async () => {
        const result = await generateLigaNews(gameId);
        if (!result.ok) {
          console.error(`[submissions/approve] generateLigaNews falhou para game_id=${gameId}: ${result.error}`);
          return;
        }
        const imageResult = await generateNewsImage({ newsId: result.news_id, ...result.newsContext });
        if (!imageResult.ok) {
          console.error(`[submissions/approve] generateNewsImage falhou para news_id=${result.news_id}: ${imageResult.errorType}`);
        }
      });
    }
  } else {
    await adminClient
      .from("result_submissions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: auth.user.id,
        rejection_reason: rejection_reason?.trim() || motivo.trim(),
      })
      .eq("id", id);
    if (sub.import_id) {
      // O delegado pode corrigir e voltar a confirmar o boletim
      await adminClient.from("game_sheet_imports").update({ status: "needs_review" }).eq("id", sub.import_id);
    }

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
