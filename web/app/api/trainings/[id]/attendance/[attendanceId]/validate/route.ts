import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/types/database";

export const runtime = "nodejs";

// POST /api/trainings/[id]/attendance/[attendanceId]/validate
// Body: { action: "approve" | "reject", override_status?: AttendanceStatus }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attendanceId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verificar role
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!userData || !["admin", "treinador"].includes(userData.role)) {
    return NextResponse.json({ error: "Sem permissão. Apenas treinadores e administradores podem validar presenças." }, { status: 403 });
  }

  const { id: trainingId, attendanceId } = await params;

  let body: { action: string; override_status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { action, override_status } = body;

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Ação inválida. Use 'approve' ou 'reject'." }, { status: 400 });
  }

  const adminClient = await createAdminClient();

  // Verificar que o registo existe e pertence a este treino
  const { data: existing } = await adminClient
    .from("training_attendance")
    .select("id, status")
    .eq("id", attendanceId)
    .eq("training_id", trainingId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Registo de presença não encontrado." }, { status: 404 });
  }

  const newStatus: AttendanceStatus =
    action === "approve"
      ? ((override_status as AttendanceStatus) ?? "present")
      : "absent";

  const { data, error } = await adminClient
    .from("training_attendance")
    .update({
      status:       newStatus,
      validated_by: user.id,
      validated_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
      updated_by:   user.id,
    })
    .eq("id", attendanceId)
    .eq("training_id", trainingId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(
    `[validate-attendance] attendance=${attendanceId} action=${action} new_status=${newStatus} by=${user.id}`
  );

  return NextResponse.json({ attendance: data, action, new_status: newStatus });
}
