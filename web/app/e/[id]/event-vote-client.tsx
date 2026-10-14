"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, HelpCircle, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerResponse {
  player_id: string;
  status: string | null;
  reason_code: string | null;
  reason_text: string | null;
  player_name: string | null;
  player_number: number | null;
}

interface Props {
  eventId: string;
  eventKind: "game" | "training";
  isPast: boolean;
  isDeadlinePassed: boolean;
  seasonId: string | null;
  isPrivileged: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  lesao: "Lesão", trabalho: "Trabalho", compromisso: "Compromisso pessoal",
  doenca: "Doença", viagem: "Viagem", outro: "Outro",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerRow({ r, accent }: { r: PlayerResponse; accent: string }) {
  const name = r.player_name ?? "—";
  const reason = r.reason_code
    ? (REASON_LABELS[r.reason_code] ?? r.reason_code)
    : r.reason_text ?? null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-b-0">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: accent }}
      >
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">
          {r.player_number != null && (
            <span className="text-muted-foreground mr-1">#{r.player_number}</span>
          )}
          {name}
        </p>
        {reason && (
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">{reason}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EventVoteClient({
  eventId, eventKind, isPast, isDeadlinePassed, seasonId, isPrivileged,
}: Props) {
  const supabase = createClient();
  const [responses, setResponses]         = useState<PlayerResponse[]>([]);
  const [loading, setLoading]             = useState(true);
  const [voting, setVoting]               = useState(false);
  const [myPlayerId, setMyPlayerId]       = useState<string | null>(null);
  const [myPlayerName, setMyPlayerName]   = useState<string | null>(null);
  const [playerReady, setPlayerReady]     = useState(false);

  // Terminology by kind
  const yesStatus = eventKind === "game" ? "available"    : "going";
  const noStatus  = eventKind === "game" ? "unavailable"  : "not_going";
  const yesLabel  = eventKind === "game" ? "Disponíveis"  : "Vão";
  const noLabel   = eventKind === "game" ? "Indisponíveis": "Não vão";
  const yesBtn    = eventKind === "game" ? "Disponível"   : "Vou";
  const noBtn     = eventKind === "game" ? "Indisponível" : "Não vou";

  // ── Player lookup (client-side) ───────────────────────────────────────────
  // players.name was removed in migration 041 — select only id/number,
  // name resolved separately from public.users.
  useEffect(() => {
    async function lookupPlayer() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { setPlayerReady(true); return; }

      const playerQ = seasonId
        ? supabase.from("players").select("id, number")
            .eq("user_id", user.id).eq("season_id", seasonId).maybeSingle()
        : supabase.from("players").select("id, number")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const [playerRes, userRes] = await Promise.all([
        playerQ,
        supabase.from("users").select("name").eq("id", user.id).maybeSingle(),
      ]);

      if (playerRes.error) {
        console.error("Player lookup error:", playerRes.error.message);
        setPlayerReady(true);
        return;
      }

      let pd = playerRes.data as { id: string; number: number | null } | null;

      // Fallback to most recent player row if season-specific returned nothing
      if (!pd && seasonId) {
        const { data: fb, error: fbErr } = await supabase
          .from("players").select("id, number")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (fbErr) console.error("Player fallback error:", fbErr.message);
        pd = fb as { id: string; number: number | null } | null;
      }

      if (pd) {
        setMyPlayerId(pd.id);
        setMyPlayerName((userRes.data as { name: string } | null)?.name ?? null);
      }
      setPlayerReady(true);
    }
    lookupPlayer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  // ── Load RSVPs ────────────────────────────────────────────────────────────
  // players(number, user_id) — both columns exist.
  // Name is resolved in a second query to public.users.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      type RsvpRaw = {
        player_id: string;
        status: string | null;
        reason_code: string | null;
        reason_text: string | null;
        players: { number: number | null; user_id: string | null }
               | { number: number | null; user_id: string | null }[]
               | null;
      };

      function extractPlayer(raw: RsvpRaw["players"]): { number: number | null; user_id: string | null } {
        const p = Array.isArray(raw) ? raw[0] : raw;
        if (!p || typeof p !== "object") return { number: null, user_id: null };
        const o = p as Record<string, unknown>;
        return {
          number:  typeof o.number  === "number" ? o.number  : null,
          user_id: typeof o.user_id === "string" ? o.user_id : null,
        };
      }

      const rsvpSelect = "player_id, status, reason_code, reason_text, players(number, user_id)";
      let rows: RsvpRaw[] = [];

      if (eventKind === "game") {
        const { data, error } = await supabase
          .from("game_availability").select(rsvpSelect).eq("game_id", eventId);
        if (error) console.error("game_availability load error:", error.message);
        else rows = (data ?? []) as unknown as RsvpRaw[];
      } else {
        const { data, error } = await supabase
          .from("training_rsvps").select(rsvpSelect).eq("training_id", eventId);
        if (error) console.error("training_rsvps load error:", error.message);
        else rows = (data ?? []) as unknown as RsvpRaw[];
      }

      // Batch-fetch player names from public.users
      const userIds = [
        ...new Set(
          rows
            .map(r => extractPlayer(r.players).user_id)
            .filter((id): id is string => id !== null)
        ),
      ];

      let nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users").select("id, name").in("id", userIds);
        if (usersError) console.error("Users name lookup error:", usersError.message);
        else {
          nameMap = Object.fromEntries(
            (usersData ?? []).map(u => {
              const row = u as { id: string; name: string };
              return [row.id, row.name];
            })
          );
        }
      }

      setResponses(rows.map(r => {
        const { number, user_id } = extractPlayer(r.players);
        return {
          player_id:     r.player_id,
          status:        r.status,
          reason_code:   r.reason_code,
          reason_text:   r.reason_text,
          player_name:   user_id ? (nameMap[user_id] ?? null) : null,
          player_number: number,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [eventId, eventKind, supabase]);

  useEffect(() => { load(); }, [load]);

  async function vote(status: string) {
    if (!myPlayerId || isPast || isDeadlinePassed || voting) return;
    setVoting(true);
    try {
      const endpoint =
        eventKind === "game"
          ? `/api/games/${eventId}/availability`
          : `/api/trainings/${eventId}/rsvp`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: (data as { error?: string }).error ?? "Erro ao registar resposta", variant: "destructive" });
        return;
      }
      await load();
      toast({ title: "Resposta registada!" });
    } finally {
      setVoting(false);
    }
  }

  const myStatus = responses.find((r) => r.player_id === myPlayerId)?.status ?? null;
  const yes      = responses.filter((r) => r.status === yesStatus);
  const no       = responses.filter((r) => r.status === noStatus);

  if (loading || !playerReady) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Voting section ── */}
      {myPlayerId ? (
        <div
          className="rounded-2xl p-5 space-y-4 bg-card"
          style={{ border: "1px solid var(--line, #E4E7EE)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--ink, #0A1220)" }}>
            {myPlayerName
              ? <>A responder como <span style={{ color: "var(--action, #F97316)" }}>{myPlayerName.split(" ")[0]}</span></>
              : "A minha resposta"}
          </p>

          {/* Current vote indicator */}
          {myStatus && (
            <div
              className="rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-sm font-medium"
              style={{
                background: myStatus === yesStatus ? "rgba(22,163,74,.08)"  : "rgba(239,68,68,.08)",
                color:      myStatus === yesStatus ? "#16A34A"               : "#ef4444",
                border:    `1px solid ${myStatus === yesStatus ? "rgba(22,163,74,.2)" : "rgba(239,68,68,.2)"}`,
              }}
            >
              {myStatus === yesStatus ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {myStatus === yesStatus ? yesBtn : noBtn}
              {!isPast && <span className="ml-auto text-xs opacity-60">podes alterar</span>}
            </div>
          )}

          {/* Deadline passed */}
          {!isPast && isDeadlinePassed && (
            <div
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-center"
              style={{
                background: "rgba(90,100,120,.08)",
                color: "var(--muted-text, #5A6478)",
                border: "1px solid var(--line, #E4E7EE)",
              }}
            >
              O prazo de resposta já fechou
            </div>
          )}

          {/* Vote buttons */}
          {!isPast && !isDeadlinePassed && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={voting}
                onClick={() => vote(yesStatus)}
                className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-60"
                style={{
                  background: myStatus === yesStatus ? "#16A34A" : "rgba(22,163,74,.08)",
                  color:      myStatus === yesStatus ? "#fff"    : "#16A34A",
                  border:     "1px solid rgba(22,163,74,.25)",
                }}
              >
                {voting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {yesBtn}
              </button>
              <button
                type="button"
                disabled={voting}
                onClick={() => vote(noStatus)}
                className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-60"
                style={{
                  background: myStatus === noStatus ? "#ef4444" : "rgba(239,68,68,.08)",
                  color:      myStatus === noStatus ? "#fff"    : "#ef4444",
                  border:     "1px solid rgba(239,68,68,.25)",
                }}
              >
                {voting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                {noBtn}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className="rounded-2xl px-4 py-4 text-center text-sm text-muted-foreground bg-card"
          style={{ border: "1px solid var(--line, #E4E7EE)" }}
        >
          A tua conta não está associada a um jogador nesta equipa.
        </div>
      )}

      {/* ── Summary counts ── */}
      {responses.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl px-4 py-3 text-center bg-card"
            style={{ border: "1px solid var(--line, #E4E7EE)" }}
          >
            <p className="text-2xl font-black tabular-nums text-green-600">{yes.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{yesLabel}</p>
          </div>
          <div
            className="rounded-xl px-4 py-3 text-center bg-card"
            style={{ border: "1px solid var(--line, #E4E7EE)" }}
          >
            <p className="text-2xl font-black tabular-nums text-red-500">{no.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{noLabel}</p>
          </div>
        </div>
      )}

      {/* ── Detailed list (privileged only) ── */}
      {isPrivileged && responses.length > 0 && (
        <>
          {yes.length > 0 && (
            <div
              className="rounded-xl overflow-hidden bg-card"
              style={{ border: "1px solid var(--line, #E4E7EE)" }}
            >
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-green-50 dark:bg-green-950/20">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                  {yesLabel} ({yes.length})
                </span>
              </div>
              <div className="px-4">
                {yes.map((r) => <PlayerRow key={r.player_id} r={r} accent="#16A34A" />)}
              </div>
            </div>
          )}

          {no.length > 0 && (
            <div
              className="rounded-xl overflow-hidden bg-card"
              style={{ border: "1px solid var(--line, #E4E7EE)" }}
            >
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-red-50 dark:bg-red-950/20">
                <X className="h-4 w-4 text-red-500" />
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {noLabel} ({no.length})
                </span>
              </div>
              <div className="px-4">
                {no.map((r) => <PlayerRow key={r.player_id} r={r} accent="#ef4444" />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── No responses yet ── */}
      {responses.length === 0 && (
        <div
          className="rounded-xl px-4 py-8 text-center bg-card"
          style={{ border: "1px solid var(--line, #E4E7EE)" }}
        >
          <HelpCircle className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            {isPast ? "Sem respostas registadas." : "Ainda não há respostas. Sê o primeiro!"}
          </p>
        </div>
      )}

    </div>
  );
}
