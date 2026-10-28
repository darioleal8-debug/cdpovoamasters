import { NextRequest, NextResponse } from "next/server";
import { authorizeAsLigaAdmin } from "@/lib/auth/liga-admin-guard";

// GET /api/liga/admin/analytics?days=30
// Estatísticas de utilização da Liga INATEL (visitantes anónimos e registados).
export async function GET(req: NextRequest) {
  const auth = await authorizeAsLigaAdmin();
  if (!auth.ok) return auth.response;

  const days = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "30") || 30));
  const { data, error } = await auth.supabase.rpc("liga_analytics", { p_days: days });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
