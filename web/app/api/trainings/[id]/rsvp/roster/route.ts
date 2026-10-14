import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// ─── GET /api/trainings/[id]/rsvp/roster ─────────────────────────────────────
// Plantel do treino com o estado de cada jogador (vai / não vai / sem resposta).
// Visível a qualquer membro activo; os motivos só chegam preenchidos a treinador+
// (regra aplicada na RPC training_rsvp_roster).
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trainingId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data, error } = await supabase.rpc("training_rsvp_roster", { p_training_id: trainingId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ players: data ?? [] });
}
