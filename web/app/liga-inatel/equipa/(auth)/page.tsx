import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCompetitionBySlug, getCompetitionGames } from "@/lib/competitions-data";
import type { PublicGame } from "@/types/competitions";
import { DelegateSignOut } from "@/components/liga/delegate-sign-out";
import { TeamLogoUpload } from "@/components/liga/team-logo-upload";
import { SubmitResultFlow } from "@/components/liga/submit-result-flow";

export const revalidate = 60;

function fmt(dateStr: string, timeStr: string | null) {
  const d = new Date(dateStr + (timeStr ? `T${timeStr}` : ""));
  return d.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
}

function GameRow({ game, teamName }: { game: PublicGame; teamName: string }) {
  const isHome = game.home_team === teamName;
  const opponent = isHome ? game.away_team : game.home_team;
  const today = new Date().toISOString().slice(0, 10);
  const isPast = game.event_date < today;
  const hasResult = game.result !== null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 16px",
        borderRadius: "10px",
        border: "1px solid var(--border, #E8E0D4)",
        background: "var(--card, #fff)",
      }}
    >
      <div style={{ width: "48px", textAlign: "center", flexShrink: 0 }}>
        <p
          style={{
            fontFamily: "var(--font-ibm-mono, monospace)",
            fontSize: "10px",
            fontWeight: 600,
            color: "#F97316",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 2px",
          }}
        >
          {isHome ? "Casa" : "Fora"}
        </p>
        <p style={{ fontSize: "11px", color: "var(--muted, #6F675F)", margin: 0 }}>
          J{game.jornada ?? "?"}
        </p>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: "14px", margin: "0 0 2px", color: "var(--fg, #15110E)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {opponent}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted, #6F675F)", margin: 0 }}>
          {fmt(game.event_date, game.event_time)}
          {game.location ? ` · ${game.location}` : ""}
        </p>
      </div>

      {hasResult ? (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontWeight: 700, fontSize: "15px", margin: 0, color: "var(--fg, #15110E)" }}>
            {isHome
              ? `${game.result!.home_score}–${game.result!.away_score}`
              : `${game.result!.away_score}–${game.result!.home_score}`}
          </p>
          <p style={{ fontSize: "10px", color: "#6F675F", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {isHome
              ? (game.result!.home_score > game.result!.away_score ? "Vitória" : "Derrota")
              : (game.result!.away_score > game.result!.home_score ? "Vitória" : "Derrota")}
          </p>
        </div>
      ) : isPast ? (
        <span
          style={{
            fontSize: "11px",
            padding: "3px 8px",
            borderRadius: "6px",
            background: "#FFF7ED",
            color: "#C2410C",
            border: "1px solid #FDBA74",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          Sem resultado
        </span>
      ) : (
        <span
          style={{
            fontSize: "11px",
            padding: "3px 8px",
            borderRadius: "6px",
            background: "#F0F9FF",
            color: "#0369A1",
            border: "1px solid #BAE6FD",
            flexShrink: 0,
          }}
        >
          Agendado
        </span>
      )}
    </div>
  );
}

export default async function DelegateDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/liga-inatel/equipa/login");

  const { data: membership } = await supabase
    .from("league_team_members")
    .select("id, team_id, role, league_teams(id, name, slug, sigla, locality, home_pavilion, logo_url)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/liga-inatel/equipa/login");

  const team = membership.league_teams as unknown as {
    id: string; name: string; slug: string | null; sigla: string | null;
    locality: string | null; home_pavilion: string | null; logo_url: string | null;
  };

  const competition = await getCompetitionBySlug("liga-inatel");
  let games: PublicGame[] = [];

  if (competition?.season_id) {
    const all = await getCompetitionGames(competition.competition_key ?? "Liga", competition.season_id);
    // inclui is_test para o delegado poder testar a submissão
    games = all.filter(
      (g) => g.home_team === team.name || g.away_team === team.name
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = games.filter((g) => g.event_date >= today).slice(0, 5);
  const pastAll = games.filter((g) => g.event_date < today).reverse();
  const past = pastAll.slice(0, 10);

  const siglaOrInitials =
    team.sigla ??
    team.name.split(" ").map((w: string) => w[0]).join("").slice(0, 3).toUpperCase();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg, #F6F2EC)",
        padding: "0 0 48px",
      }}
    >
      {/* Header banner */}
      <div style={{ background: "#0A1220", padding: "28px 16px 24px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#F97316",
              margin: "0 0 10px",
            }}
          >
            LIGA INATEL · DELEGADO
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "10px",
                background: "#F97316",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontWeight: 900,
                fontSize: "14px",
                color: "#fff",
                fontFamily: "var(--font-bc-heavy, sans-serif)",
                letterSpacing: "0.06em",
              }}
            >
              {siglaOrInitials}
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-bc-heavy, sans-serif)",
                  fontWeight: 800,
                  fontSize: "22px",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#F6F2EC",
                  margin: "0 0 3px",
                }}
              >
                {team.name}
              </h1>
              <p style={{ fontSize: "12px", color: "#7A6F64", margin: 0 }}>
                {[team.locality, team.home_pavilion].filter(Boolean).join(" · ") || "Liga INATEL"}
              </p>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: "720px", margin: "16px auto 0", display: "flex", justifyContent: "flex-end" }}>
          <DelegateSignOut />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "24px 16px 0" }}>
        {/* Próximos jogos */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted, #6F675F)", margin: "0 0 12px" }}>
            Próximos jogos
          </h2>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: "14px", color: "var(--muted, #6F675F)", padding: "20px 0" }}>Sem jogos agendados.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {upcoming.map((g) => <GameRow key={g.id} game={g} teamName={team.name} />)}
            </div>
          )}
        </section>

        {/* Jogos passados */}
        {past.length > 0 && (
          <section style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted, #6F675F)", margin: "0 0 12px" }}>
              Jogos recentes
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {past.map((g) => <GameRow key={g.id} game={g} teamName={team.name} />)}
            </div>
          </section>
        )}

        {/* Logo da equipa */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted, #6F675F)", margin: "0 0 12px" }}>
            Identidade visual
          </h2>
          <TeamLogoUpload
            teamId={team.id}
            teamName={team.name}
            currentLogoUrl={team.logo_url ?? null}
          />
        </section>

        {/* Submissão de resultados */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted, #6F675F)", margin: "0 0 12px" }}>
            Resultados
          </h2>
          <SubmitResultFlow games={pastAll} teamName={team.name} />
        </section>

        <p style={{ marginTop: "24px", textAlign: "center" }}>
          <Link href="/liga-inatel" style={{ fontSize: "12px", color: "#F97316", textDecoration: "none" }}>
            ← Ver página pública da liga
          </Link>
        </p>
      </div>
    </div>
  );
}
