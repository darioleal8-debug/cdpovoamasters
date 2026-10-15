import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPendingSubmissions } from "@/lib/competitions-data";

export const runtime = "nodejs";

export async function GET() {
  try {
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

    const submissions = await getPendingSubmissions();
    return NextResponse.json({ submissions });
  } catch (err) {
    console.error("admin/result-submissions GET error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
