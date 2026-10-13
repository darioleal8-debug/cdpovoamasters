import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authorize } from "@/lib/auth/guards";

export const runtime = "nodejs";

export async function GET() {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const supabase = auth.supabase;

  // Comunicados = canal 'announcement' (onde o admin publica). Lido com service role porque
  // é para todos os membros ativos, participem ou não do canal (UX-12).
  const admin = await createAdminClient();
  const { data: announcement } = await admin
    .from("chats")
    .select("id")
    .eq("type", "announcement")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle(); // tolera mais de um canal announcement

  if (!announcement?.id) {
    return NextResponse.json({ comunicados: [] });
  }

  const { data: msgs } = await admin
    .from("chat_messages")
    .select("id, content, created_at, sender_id")
    .eq("chat_id", announcement.id)
    .eq("is_system", false)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!msgs || msgs.length === 0) {
    return NextResponse.json({ comunicados: [] });
  }

  // Fetch sender names/roles
  const senderIds = [
    ...new Set(
      msgs
        .map((m: { sender_id: string | null }) => m.sender_id)
        .filter(Boolean) as string[]
    ),
  ];

  const { data: senders } = senderIds.length > 0
    ? await supabase.from("user_display_names").select("id, name, role").in("id", senderIds)
    : { data: [] };

  const senderById = new Map(
    (senders ?? []).map((s: { id: string; name: string; role: string }) => [s.id, s])
  );

  const comunicados = msgs.map((m: { id: string; content: string | null; created_at: string; sender_id: string | null }) => {
    const sender = m.sender_id ? senderById.get(m.sender_id) : null;
    return {
      id:          m.id,
      content:     m.content,
      created_at:  m.created_at,
      sender_name: sender?.name ?? "Equipa",
      sender_role: sender?.role ?? "",
    };
  });

  return NextResponse.json({ comunicados });
}
