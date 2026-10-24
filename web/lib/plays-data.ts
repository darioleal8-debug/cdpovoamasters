import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Play, PlayProgress } from "@/types/plays";

export async function getPublishedPlays(club = "default"): Promise<Play[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("plays")
    .select("*")
    .eq("club", club)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Play[];
}

export async function getAllPlays(club = "default"): Promise<Play[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("plays")
    .select("*")
    .eq("club", club)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Play[];
}

export async function getPlay(id: string): Promise<Play | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("plays")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Play | null) ?? null;
}

export async function getPlayProgress(
  playId: string,
  userId: string
): Promise<PlayProgress | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("play_progress")
    .select("*")
    .eq("play_id", playId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PlayProgress | null) ?? null;
}

export async function upsertProgress(
  playId: string,
  userId: string,
  studied: boolean
): Promise<void> {
  const supabase = await createAdminClient();
  const now = new Date().toISOString();
  await supabase.from("play_progress").upsert(
    {
      play_id: playId,
      user_id: userId,
      last_viewed_at: now,
      ...(studied ? { studied_at: now } : {}),
    },
    { onConflict: "play_id,user_id" }
  );
}

export async function getStudiedCounts(
  playIds: string[]
): Promise<Record<string, number>> {
  if (playIds.length === 0) return {};
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("play_progress")
    .select("play_id")
    .in("play_id", playIds)
    .not("studied_at", "is", null);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.play_id] = (counts[row.play_id] ?? 0) + 1;
  }
  return counts;
}

export async function getStudiedByList(
  playId: string
): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data: rows } = await supabase
    .from("play_progress")
    .select("user_id")
    .eq("play_id", playId)
    .not("studied_at", "is", null);

  const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id);
  if (userIds.length === 0) return [];

  const { data: users } = await supabase
    .from("users")
    .select("name")
    .in("id", userIds);

  return (users ?? []).map((u: { name: string }) => u.name);
}
