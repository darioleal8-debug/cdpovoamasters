import { createClient } from "@/lib/supabase/server";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const POSITION_LABELS: Record<string, string> = {
  base: "Base",
  extremo: "Extremo",
  poste: "Poste",
};

function dateLabel(dateStr: string): string {
  const todayMs  = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  const gameMs   = new Date(dateStr + "T00:00:00").getTime();
  const diffDays = Math.round((gameMs - todayMs) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";
  return `Em ${diffDays} dias`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-PT", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export async function NextGameCard({
  highlightPlayerId,
  showAdminLinks = false,
}: {
  highlightPlayerId?: string | null;
  showAdminLinks?: boolean;
}) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: game } = await supabase
    .from("events")
    .select("id, title, event_date, event_time, location")
    .eq("type", "jogo")
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!game) return null;

  const { data: callupsRaw } = await supabase
    .from("game_callups")
    .select("id, player:players(id, name, number, position, photo_url)")
    .eq("game_id", game.id);

  type PlayerRow = { id: string; name: string; number: number | null; position: string | null; photo_url: string | null };
  type CallupRow = { id: string; player: PlayerRow | null };
  const callups = ((callupsRaw ?? []) as unknown as CallupRow[]).filter((c) => c.player !== null);

  const label   = dateLabel(game.event_date);
  const isToday = label === "Hoje";

  return (
    <div className="overflow-hidden rounded-xl border shadow-sm">
      {/* ── Cabeçalho ── */}
      <div
        className="relative px-5 py-5"
        style={{ backgroundColor: "var(--club-primary, #111111)", color: "#fff" }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[0.65rem] font-bold uppercase tracking-widest opacity-60">
            Próximo Jogo
          </span>
          <Badge
            className="text-[10px] font-semibold"
            style={{
              backgroundColor: isToday ? "var(--club-secondary, #F28C28)" : "rgba(255,255,255,0.15)",
              color: "#fff",
              border: "none",
            }}
          >
            {label}
          </Badge>
        </div>

        <h2 className="mb-3 text-lg font-bold leading-tight">{game.title}</h2>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm opacity-80">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {fmtDate(game.event_date)}
          </span>
          {game.event_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {game.event_time.slice(0, 5)}h
            </span>
          )}
          {game.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {game.location}
            </span>
          )}
        </div>

        {showAdminLinks && (
          <div className="mt-4 flex gap-2">
            <Link
              href={`/jogos/${game.id}/live`}
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#ffffff", color: "var(--club-primary, #111111)" }}
            >
              Estatísticas ao vivo
            </Link>
            <Link
              href={`/jogos/${game.id}/stats`}
              className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 transition-colors"
            >
              Ver estatísticas
            </Link>
          </div>
        )}
      </div>

      {/* ── Convocados ── */}
      <div className="bg-background px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            Convocados
            {callups.length > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal">({callups.length})</span>
            )}
          </span>
        </div>

        {callups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há convocados definidos.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {callups.map((c) => {
              const p = c.player!;
              const isHighlighted = highlightPlayerId && p.id === highlightPlayerId;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                  style={isHighlighted ? { backgroundColor: "var(--club-bg, #eeeeee)" } : undefined}
                >
                  {/* Avatar */}
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: isHighlighted ? "var(--club-secondary, #F28C28)" : "var(--club-primary, #111111)" }}
                  >
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt={p.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      initials(p.name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate text-xs font-semibold leading-tight ${isHighlighted ? "text-foreground" : ""}`}>
                      {p.number ? `#${p.number} ` : ""}{p.name.split(" ")[0]}
                    </p>
                    {p.position && (
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {POSITION_LABELS[p.position] ?? p.position}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
