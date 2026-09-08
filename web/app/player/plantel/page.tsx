import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { User } from "lucide-react";
import { POSITION_LABELS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlayerPlantelPage() {
  const admin = await createAdminClient();

  // Temporada activa, ou a mais recente como fallback
  let { data: season } = await admin
    .from("seasons")
    .select("id, name")
    .eq("status", "active")
    .maybeSingle();

  if (!season) {
    const { data: latest } = await admin
      .from("seasons")
      .select("id, name")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    season = latest;
  }

  if (!season) {
    return (
      <div className="py-20 text-center text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>
        Nenhuma temporada disponível.
      </div>
    );
  }

  const { data: players } = await admin
    .from("players")
    .select("id, number, position, photo_url, user_id")
    .eq("season_id", season.id)
    .order("number", { ascending: true });

  const userIds = (players ?? []).map((p) => p.user_id as string).filter(Boolean);
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, name")
      .in("id", userIds);
    (users ?? []).forEach((u) => nameMap.set(u.id as string, u.name as string));
  }

  const roster = (players ?? []).map((p) => ({
    id:       p.id as string,
    number:   p.number as number | null,
    position: p.position as string | null,
    photoUrl: p.photo_url as string | null,
    name:     nameMap.get(p.user_id as string) ?? "Jogador",
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1
          className="font-condensed font-bold text-2xl uppercase tracking-wide"
          style={{ color: "var(--ink,#0A1220)" }}
        >
          Plantel
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--muted-text,#5A6478)" }}>
          {season.name} · {roster.length} jogador{roster.length !== 1 ? "es" : ""}
        </p>
      </div>

      {roster.length === 0 ? (
        <div className="py-20 text-center text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>
          Nenhum jogador inscrito nesta temporada.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {roster.map((player) => {
            const initials = player.name
              .trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            const posLabel = player.position
              ? (POSITION_LABELS[player.position as keyof typeof POSITION_LABELS] ?? player.position)
              : null;

            return (
              <Link
                key={player.id}
                href={`/player/plantel/${player.id}`}
                className="flex flex-col items-center rounded-2xl p-4 gap-3 transition-all active:opacity-70"
                style={{
                  background:  "var(--paper,#F6F7F9)",
                  border:      "1px solid var(--line,#E4E7EE)",
                  touchAction: "manipulation",
                }}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {player.photoUrl ? (
                    <img
                      src={player.photoUrl}
                      alt={player.name}
                      className="h-20 w-20 rounded-full object-cover"
                      style={{ border: "2px solid var(--line,#E4E7EE)" }}
                    />
                  ) : (
                    <div
                      className="h-20 w-20 rounded-full flex items-center justify-center text-xl font-bold"
                      style={{
                        background: "rgba(249,115,22,0.10)",
                        border:     "2px solid var(--line,#E4E7EE)",
                        color:      "#F97316",
                      }}
                    >
                      {initials || <User className="h-7 w-7" />}
                    </div>
                  )}
                  {player.number != null && (
                    <span
                      className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-black"
                      style={{
                        background: "#F97316",
                        color:      "#fff",
                        boxShadow:  "0 0 0 2px var(--paper,#F6F7F9)",
                      }}
                    >
                      {player.number}
                    </span>
                  )}
                </div>

                {/* Name & position */}
                <div className="text-center min-w-0 w-full">
                  <p
                    className="text-[13px] font-semibold leading-tight truncate"
                    style={{ color: "var(--ink,#0A1220)" }}
                  >
                    {player.name}
                  </p>
                  {posLabel && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-text,#5A6478)" }}>
                      {posLabel}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
