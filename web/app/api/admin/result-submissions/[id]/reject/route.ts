import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ADMIN } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;

    // Sessão + conta ativa + admin (papel ativo)
    const auth = await authorize(ADMIN);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const admin = await createAdminClient();
    const { data: submission } = await admin
      .from("result_submissions")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: "Submissão não encontrada" }, { status: 404 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json({ error: "Submissão já foi processada" }, { status: 409 });
    }

    await admin
      .from("result_submissions")
      .update({
        status:           "rejected",
        reviewed_at:      new Date().toISOString(),
        reviewed_by:      user.id,
        rejection_reason: reason,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reject submission error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
