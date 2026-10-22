import { after } from "next/server";
import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

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

  // Atualizar status da submissão
  await adminClient
    .from("result_submissions")
    .update({
      status: action === "approve" ? "approved" : "rejected",
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

    // UPSERT resultado oficial
    await adminClient
      .from("league_game_results")
      .upsert({
        event_id: sub.event_id,
        competition_id: comp?.id ?? sub.competition_id,
        home_team_name: sub.home_team_name,
        away_team_name: sub.away_team_name,
        home_score: sub.home_score,
        away_score: sub.away_score,
        approved_at: new Date().toISOString(),
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

    // Gerar notícia em background (fire-and-forget; falhas não bloqueiam a aprovação)
    const isTestGame = await (async () => {
      try {
        const { data: ev } = await adminClient.from("events").select("description").eq("id", sub.event_id).single();
        const meta = JSON.parse(ev?.description ?? "{}") as { is_test?: boolean };
        return meta.is_test === true;
      } catch { return false; }
    })();

    if (!isTestGame) {
      const gameId = sub.event_id;
      const cookieHeader = req.headers.get("cookie") ?? "";
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hoophub.pt";

      // after() garante que o fetch corre após o response ser enviado,
      // mesmo numa serverless function — substitui o fire-and-forget que
      // terminava antes do DeepSeek responder.
      after(async () => {
        try {
          const r = await fetch(`${baseUrl}/api/liga/admin/generate-news`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookieHeader },
            body: JSON.stringify({ game_id: gameId }),
          });
          if (!r.ok) {
            const t = await r.text();
            console.error(`[submissions/approve] generate-news falhou (${r.status}): ${t.slice(0, 300)}`);
          }
        } catch (e) {
          console.error("[submissions/approve] generate-news exception:", String(e));
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

  return NextResponse.json({ ok: true });
}
