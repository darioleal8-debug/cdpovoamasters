import { NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const { eventId } = await params;
  const adminClient = await createAdminClient();

  const { data, error } = await adminClient
    .from("liga_resultado_audit")
    .select("id, jogo_id, alterado_por, valor_antigo, valor_novo, motivo, created_at")
    .eq("jogo_id", eventId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ audit: data ?? [] });
}
