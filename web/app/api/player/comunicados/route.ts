import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Find team chat(s)
  const { data: teamChats } = await supabase
    .from("chats")
    .select("id")
    .eq("type", "team")
    .limit(5);

  if (!teamChats || teamChats.length === 0) {
    return NextResponse.json({ comunicados: [] });
  }

  const teamChatIds = teamChats.map((c: { id: string }) => c.id);

  // Fetch important messages
  const { data: msgs } = await supabase
    .from("chat_messages")
    .select("id, content, created_at, sender_id")
    .in("chat_id", teamChatIds)
    .eq("importante", true)
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
    ? await supabase.from("users").select("id, name, role").in("id", senderIds)
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
