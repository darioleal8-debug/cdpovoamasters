import { NextRequest, NextResponse } from "next/server";
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

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

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
