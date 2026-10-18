import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/guards";
import { ADMIN } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { getPendingSubmissions } from "@/lib/competitions-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Sessão + conta ativa + admin (papel ativo)
    const auth = await authorize(ADMIN);
    if (!auth.ok) return auth.response;

    const submissions = await getPendingSubmissions();
    return NextResponse.json({ submissions });
  } catch (err) {
    console.error("admin/result-submissions GET error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
