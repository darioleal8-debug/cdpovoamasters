import { notFound } from "next/navigation";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Club   { id: string; club_name: string; logo_url: string | null; slug: string }
interface Season { id: string; name: string; year: string }
interface Player { id: string; name: string; number: number | null; position: string | null; photo_url: string | null }
interface Game   {
  id: string; event_date: string; event_time: string | null;
  opponent: string | null; location: string | null; game_type: string | null;
  is_home_game: boolean | null; home_score: number | null; away_score: number | null; status: string | null;
}
interface TeamRecord { wins: number; losses: number; played: number }

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getTeamData(slug: string): Promise<{
  club: Club; season: Season | null; players: Player[]; games: Game[]; record: TeamRecord;
} | null> {
  const admin = await createAdminClient();

  const { data: club } = await admin
    .from("club_settings")
    .select("id, club_name, logo_url, slug")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  if (!club) return null;

  const { data: season } = await admin
    .from("seasons")
    .select("id, name, year")
    .eq("status", "ativa")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let players: Player[] = [];
  let games: Game[] = [];

  if (season) {
    // Players
    const { data: playerRows } = await admin
      .from("players")
      .select("id, user_id, number, position, photo_url")
      .eq("season_id", season.id);

    if (playerRows?.length) {
      const userIds = [...new Set((playerRows as { user_id: string }[]).map((p) => p.user_id).filter(Boolean))];
      const { data: userRows } = await admin
        .from("users")
        .select("id, name")
        .in("id", userIds);

      const userMap = new Map(((userRows ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));

      players = (playerRows as { id: string; user_id: string; number: number | null; position: string | null; photo_url: string | null }[])
        .map((p) => ({
          id: p.id,
          name: userMap.get(p.user_id) ?? "Jogador",
          number: p.number,
          position: p.position,
          photo_url: p.photo_url,
        }))
        .sort((a, b) => {
          if (a.number !== null && b.number !== null) return a.number - b.number;
          if (a.number === null) return 1;
          if (b.number === null) return -1;
          return a.name.localeCompare(b.name, "pt");
        });
    }

    // Games
    const { data: eventRows } = await admin
      .from("events")
      .select("id, event_date, event_time, opponent, location, game_type")
      .eq("season_id", season.id)
      .eq("type", "jogo")
      .order("event_date", { ascending: false });

    if (eventRows?.length) {
      const eventIds = (eventRows as { id: string }[]).map((e) => e.id);
      const { data: sessionRows } = await admin
        .from("game_sessions")
        .select("event_id, home_score, away_score, status, is_home_game")
        .in("event_id", eventIds);

      const sessionMap = new Map(
        ((sessionRows ?? []) as { event_id: string; home_score: number | null; away_score: number | null; status: string | null; is_home_game: boolean | null }[])
          .map((s) => [s.event_id, s])
      );

      games = (eventRows as { id: string; event_date: string; event_time: string | null; opponent: string | null; location: string | null; game_type: string | null }[])
        .map((e) => {
          const s = sessionMap.get(e.id);
          return {
            id: e.id,
            event_date: e.event_date,
            event_time: e.event_time,
            opponent: e.opponent,
            location: e.location,
            game_type: e.game_type,
            is_home_game: s?.is_home_game ?? null,
            home_score: s?.home_score ?? null,
            away_score: s?.away_score ?? null,
            status: s?.status ?? null,
          };
        });
    }
  }

  const finished = games.filter((g) => g.status === "finished");
  const wins   = finished.filter((g) => (g.home_score ?? 0) > (g.away_score ?? 0)).length;
  const losses = finished.filter((g) => (g.home_score ?? 0) < (g.away_score ?? 0)).length;

  return { club, season, players, games, record: { wins, losses, played: finished.length } };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTeamData(slug);
  if (!data) return { title: "Equipa não encontrada" };

  const { club } = data;
  return {
    title: club.club_name,
    description: `Plantel, calendário e resultados do ${club.club_name} — basquetebol de veteranos.`,
    openGraph: {
      title: `${club.club_name} · hoophub`,
      description: `Plantel, calendário e resultados do ${club.club_name}.`,
      url: `https://hoophub.pt/equipa/${slug}`,
    },
  };
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

const ORANGE      = "#F28C28";
const DARK_ORANGE = "#B26016";
const BLACK       = "#111111";
const GRAY        = "#4B5563";
const LIGHT       = "#F2F4F7";
const BORDER      = "#E5E7EB";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : null;
}

function isFuture(iso: string) {
  return new Date(iso + "T23:59:00") >= new Date();
}

const POSITION_LABELS: Record<string, string> = {
  point_guard:   "Base",
  shooting_guard:"Extremo-Base",
  small_forward: "Extremo",
  power_forward: "Extremo-Poste",
  center:        "Poste",
  guard:         "Guarda",
  forward:       "Extremo",
  Base:          "Base",
  Extremo:       "Extremo",
  Poste:         "Poste",
};

function posLabel(pos: string | null): string {
  if (!pos) return "";
  return POSITION_LABELS[pos] ?? pos;
}

// ─── Player card ──────────────────────────────────────────────────────────────

function PlayerCard({ player }: { player: Player }) {
  const initials = player.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  return (
    <div
      style={{
        borderRadius: 16,
        background: "#fff",
        border: `1px solid ${BORDER}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 16px 16px",
        gap: 10,
      }}
    >
      {/* Photo */}
      <div style={{ position: "relative", width: 80, height: 80 }}>
        {player.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photo_url}
            alt={player.name}
            style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: `2px solid ${BORDER}` }}
          />
        ) : (
          <div
            style={{
              width: 80, height: 80, borderRadius: "50%",
              background: LIGHT, border: `2px solid ${BORDER}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 900, color: GRAY,
            }}
          >
            {initials}
          </div>
        )}
        {/* Jersey number badge */}
        {player.number !== null && (
          <div
            style={{
              position: "absolute", bottom: -4, right: -4,
              background: ORANGE, color: "#fff",
              borderRadius: "50%", width: 26, height: 26,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900,
              border: "2px solid #fff",
            }}
          >
            {player.number}
          </div>
        )}
      </div>

      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: BLACK, lineHeight: 1.3 }}>
          {player.name}
        </p>
        {player.position && (
          <p style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>
            {posLabel(player.position)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Game row ─────────────────────────────────────────────────────────────────

function GameRow({ game }: { game: Game }) {
  const finished = game.status === "finished";
  const future = isFuture(game.event_date);
  const won = finished && (game.home_score ?? 0) > (game.away_score ?? 0);
  const lost = finished && (game.home_score ?? 0) < (game.away_score ?? 0);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        background: "#fff",
        border: `1px solid ${BORDER}`,
      }}
    >
      {/* Date */}
      <div style={{ minWidth: 76, flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: BLACK }}>{fmtDate(game.event_date)}</p>
        {fmtTime(game.event_time) && (
          <p style={{ fontSize: 11, color: GRAY }}>{fmtTime(game.event_time)}</p>
        )}
      </div>

      {/* Home/Away pill */}
      <span
        style={{
          flexShrink: 0,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "2px 7px",
          borderRadius: 20,
          background: game.is_home_game ? "#FFF7ED" : LIGHT,
          color: game.is_home_game ? DARK_ORANGE : GRAY,
          border: `1px solid ${game.is_home_game ? "#FDDCB0" : BORDER}`,
        }}
      >
        {game.is_home_game === null ? "—" : game.is_home_game ? "Casa" : "Fora"}
      </span>

      {/* Opponent */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: BLACK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {game.opponent ?? "Adversário"}
        </p>
        {game.location && (
          <p style={{ fontSize: 11, color: GRAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {game.location}
          </p>
        )}
      </div>

      {/* Result */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        {finished ? (
          <>
            <p
              style={{
                fontSize: 16, fontWeight: 900,
                color: won ? "#15803D" : lost ? "#B91C1C" : GRAY,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {game.home_score}–{game.away_score}
            </p>
            <p
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: won ? "#15803D" : lost ? "#B91C1C" : GRAY,
              }}
            >
              {won ? "Vitória" : lost ? "Derrota" : "Empate"}
            </p>
          </>
        ) : (
          <p style={{ fontSize: 12, color: future ? DARK_ORANGE : GRAY, fontWeight: 600 }}>
            {future ? "Próximo" : "Sem resultado"}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EquipaPage({ params }: Props) {
  const { slug } = await params;
  const data = await getTeamData(slug);
  if (!data) notFound();

  const { club, season, players, games, record } = data;

  const upcomingGames = games.filter((g) => g.status !== "finished" && isFuture(g.event_date));
  const playedGames   = games.filter((g) => g.status === "finished" || !isFuture(g.event_date));

  return (
    <>
      {/* ── Hero ── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${BLACK} 0%, #1e2a3a 100%)`,
          padding: "40px 24px 32px",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
            {/* Logo */}
            <div
              style={{
                width: 72, height: 72, borderRadius: 16,
                background: ORANGE, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {club.logo_url ? (
                <Image
                  src={club.logo_url}
                  alt={club.club_name}
                  width={72}
                  height={72}
                  style={{ objectFit: "contain", padding: 4 }}
                />
              ) : (
                <span style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>
                  {club.club_name.charAt(0)}
                </span>
              )}
            </div>

            <div>
              <h1 style={{ fontSize: "clamp(22px,5vw,34px)", fontWeight: 900, color: "#fff", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {club.club_name}
              </h1>
              {season && (
                <p style={{ fontSize: 14, color: "rgba(255,255,255,.55)", marginTop: 4 }}>
                  {season.name} · {season.year}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { label: "Vitórias",  value: record.wins,   color: "#4ADE80" },
              { label: "Derrotas",  value: record.losses, color: "#F87171" },
              { label: "Jogadores", value: players.length, color: "rgba(255,255,255,.9)" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  padding: "12px 20px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,.07)",
                  border: "1px solid rgba(255,255,255,.1)",
                  textAlign: "center",
                  minWidth: 80,
                }}
              >
                <p style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Anchor nav ── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, background: "#fff", position: "sticky", top: 60, zIndex: 40 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", display: "flex", gap: 0 }}>
          {[
            { label: "Plantel", href: "#plantel" },
            { label: "Calendário", href: "#calendario" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              style={{
                display: "block",
                padding: "14px 20px",
                fontSize: 14,
                fontWeight: 600,
                color: GRAY,
                textDecoration: "none",
                borderBottom: "2px solid transparent",
                transition: "color .15s, border-color .15s",
              }}
              className="anchor-nav-link"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px 64px" }}>

        {/* Plantel */}
        <section id="plantel" style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: BLACK, marginBottom: 20, letterSpacing: "-0.01em" }}>
            Plantel
            {season && (
              <span style={{ fontSize: 14, fontWeight: 500, color: GRAY, marginLeft: 10 }}>
                {season.name}
              </span>
            )}
          </h2>

          {players.length === 0 ? (
            <div
              style={{
                borderRadius: 16, background: LIGHT, border: `1px solid ${BORDER}`,
                padding: "32px", textAlign: "center",
              }}
            >
              <p style={{ fontSize: 15, color: GRAY }}>Plantel não disponível.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 12,
              }}
            >
              {players.map((p) => (
                <PlayerCard key={p.id} player={p} />
              ))}
            </div>
          )}
        </section>

        {/* Calendário */}
        <section id="calendario">
          <h2 style={{ fontSize: 22, fontWeight: 900, color: BLACK, marginBottom: 20, letterSpacing: "-0.01em" }}>
            Calendário
          </h2>

          {games.length === 0 ? (
            <div
              style={{
                borderRadius: 16, background: LIGHT, border: `1px solid ${BORDER}`,
                padding: "32px", textAlign: "center",
              }}
            >
              <p style={{ fontSize: 15, color: GRAY }}>Sem jogos registados.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {upcomingGames.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DARK_ORANGE, marginBottom: 10 }}>
                    Próximos jogos
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {upcomingGames.slice().reverse().map((g) => <GameRow key={g.id} game={g} />)}
                  </div>
                </div>
              )}

              {playedGames.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: GRAY, marginBottom: 10 }}>
                    Jogos realizados
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {playedGames.map((g) => <GameRow key={g.id} game={g} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <style>{`
        .anchor-nav-link:hover { color: ${ORANGE}; border-bottom-color: ${ORANGE}; }
      `}</style>
    </>
  );
}
