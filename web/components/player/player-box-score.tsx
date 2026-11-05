import { createAdminClient, createClient } from "@/lib/supabase/server";
import { toPeriodPartials } from "@/lib/live/period-scores";
import { formatMinutes } from "@/lib/live/minutes";

/**
 * Box score de um jogo terminado para a área do jogador (sem play-by-play).
 * Server component — lê com a sessão do utilizador (RLS: leitura autenticada).
 * Com `publicView` (página pública do jogo na Liga INATEL) lê com service role,
 * só para jogos já finalizados — o chamador garante que não é jogo de teste.
 * Em game_sessions/player_game_stats o CD Póvoa é sempre o lado "home".
 */

type StatRow = {
  player_id: string;
  pts: number;
  fg2_made: number; fg2_att: number;
  fg3_made: number; fg3_att: number;
  ft_made: number; ft_att: number;
  reb_off: number; reb_def: number;
  ast: number; stl: number; blk: number; tov: number;
  fouls_committed: number; fouls_drawn: number;
  efficiency: number | string | null;
  seconds_played: number | null;
  plus_minus: number | null;
};

const pct = (m: number, a: number) => (a > 0 ? `${Math.round((m / a) * 100)}%` : "—");

function Cell({ children, bold, muted }: { children: React.ReactNode; bold?: boolean; muted?: boolean }) {
  return (
    <td className={`px-2 py-2 text-center tabular-nums ${bold ? "font-bold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      {children}
    </td>
  );
}

export async function PlayerBoxScore({
  sessionId,
  opponentName,
  homeScore,
  awayScore,
  highlightPlayerIds = [],
  publicView = false,
  title = "Box Score",
  ourTeamName = "CD Póvoa",
}: {
  sessionId: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  highlightPlayerIds?: string[];
  publicView?: boolean;
  title?: string;
  ourTeamName?: string;
}) {
  const supabase = publicView ? await createAdminClient() : await createClient();

  const [statsRes, periodsRes, sessRes] = await Promise.all([
    supabase.from("player_game_stats")
      .select("player_id, pts, fg2_made, fg2_att, fg3_made, fg3_att, ft_made, ft_att, reb_off, reb_def, ast, stl, blk, tov, fouls_committed, fouls_drawn, efficiency, seconds_played, plus_minus")
      .eq("game_session_id", sessionId),
    supabase.from("game_period_scores")
      .select("period, home_score, away_score")
      .eq("game_session_id", sessionId)
      .order("period"),
    supabase.from("game_sessions")
      .select("away_reb_off, away_reb_def")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);

  const stats = (statsRes.data ?? []) as StatRow[];
  const ids = stats.map((s) => s.player_id);
  const [namesRes, numbersRes] = ids.length
    ? await Promise.all([
        supabase.from("v_roster_public").select("player_id, name").in("player_id", ids),
        supabase.from("players").select("id, number").in("id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const nameById = new Map(((namesRes.data ?? []) as { player_id: string; name: string | null }[]).map((r) => [r.player_id, r.name]));
  const numberById = new Map(((numbersRes.data ?? []) as { id: string; number: number | null }[]).map((r) => [r.id, r.number]));

  // Só jogadores identificados (linhas fantasma não entram)
  const rows = stats
    .filter((s) => nameById.get(s.player_id))
    .sort((a, b) => b.pts - a.pts || Number(b.efficiency ?? 0) - Number(a.efficiency ?? 0));

  if (rows.length === 0) return null;

  const t = rows.reduce((a, s) => ({
    pts: a.pts + s.pts,
    fg2m: a.fg2m + s.fg2_made, fg2a: a.fg2a + s.fg2_att,
    fg3m: a.fg3m + s.fg3_made, fg3a: a.fg3a + s.fg3_att,
    ftm: a.ftm + s.ft_made, fta: a.fta + s.ft_att,
    reb: a.reb + s.reb_off + s.reb_def,
    ast: a.ast + s.ast, stl: a.stl + s.stl, blk: a.blk + s.blk, tov: a.tov + s.tov,
    fc: a.fc + s.fouls_committed, fd: a.fd + s.fouls_drawn,
    eff: a.eff + Math.round(Number(s.efficiency ?? 0)),
  }), { pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fc: 0, fd: 0, eff: 0 });

  const partials = toPeriodPartials((periodsRes.data ?? []) as { period: number; home_score: number; away_score: number }[]);
  const oppReb = (sessRes.data?.away_reb_off ?? 0) + (sessRes.data?.away_reb_def ?? 0);
  const periodLabel = (p: number) => (p <= 4 ? `${p}º` : `P${p - 4}`);

  return (
    <section id="box-score" className="space-y-3 scroll-mt-20">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>

      {/* Parciais por período */}
      {partials.length > 0 && (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-semibold">Equipa</th>
                {partials.map((p) => (
                  <th key={p.period} className="px-2 py-2 text-center font-semibold">{periodLabel(p.period)}</th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">Final</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2 font-semibold text-cdpovoa-primary">{ourTeamName}</td>
                {partials.map((p) => <Cell key={p.period}>{p.home_score}</Cell>)}
                <Cell bold>{homeScore}</Cell>
              </tr>
              <tr>
                <td className="px-3 py-2 font-semibold text-muted-foreground truncate max-w-[140px]">{opponentName}</td>
                {partials.map((p) => <Cell key={p.period}>{p.away_score}</Cell>)}
                <Cell bold>{awayScore}</Cell>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Totais das equipas */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-semibold">Equipa</th>
              <th className="px-2 py-2 text-center font-semibold">Pontos</th>
              <th className="px-2 py-2 text-center font-semibold">Reb.</th>
              <th className="px-2 py-2 text-center font-semibold">Assist.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-2 font-semibold text-cdpovoa-primary">{ourTeamName}</td>
              <Cell bold>{homeScore}</Cell>
              <Cell bold>{t.reb}</Cell>
              <Cell bold>{t.ast}</Cell>
            </tr>
            <tr>
              <td className="px-3 py-2 font-semibold text-muted-foreground truncate max-w-[140px]">{opponentName}</td>
              <Cell bold>{awayScore}</Cell>
              <Cell bold>{oppReb}</Cell>
              <Cell muted>—</Cell>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Box score individual */}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted">#</th>
              <th className="text-left px-2 py-2 font-semibold min-w-[100px]">Jogador</th>
              <th className="px-2 py-2 text-center font-semibold">MIN</th>
              <th className="px-2 py-2 text-center font-semibold">PTS</th>
              <th className="px-2 py-2 text-center font-semibold">2P C/T</th>
              <th className="px-2 py-2 text-center font-semibold">2P%</th>
              <th className="px-2 py-2 text-center font-semibold">3P C/T</th>
              <th className="px-2 py-2 text-center font-semibold">3P%</th>
              <th className="px-2 py-2 text-center font-semibold">LL C/T</th>
              <th className="px-2 py-2 text-center font-semibold">LL%</th>
              <th className="px-2 py-2 text-center font-semibold">REB</th>
              <th className="px-2 py-2 text-center font-semibold">AST</th>
              <th className="px-2 py-2 text-center font-semibold">ROU</th>
              <th className="px-2 py-2 text-center font-semibold">DES</th>
              <th className="px-2 py-2 text-center font-semibold">PER</th>
              <th className="px-2 py-2 text-center font-semibold">F</th>
              <th className="px-2 py-2 text-center font-semibold">FS</th>
              <th className="px-2 py-2 text-center font-semibold text-cdpovoa-primary">EFF</th>
              <th className="px-2 py-2 text-center font-semibold">+/-</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((s) => {
              const me = highlightPlayerIds.includes(s.player_id);
              const pm = s.plus_minus ?? 0;
              return (
                <tr key={s.player_id} className={me ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                  <td className={`px-3 py-2 font-mono font-bold sticky left-0 ${me ? "bg-orange-50 dark:bg-orange-950/20" : "bg-card"}`}>
                    {numberById.get(s.player_id) ?? "–"}
                  </td>
                  <td className="px-2 py-2 font-medium">
                    {(nameById.get(s.player_id) ?? "—").split(" ").slice(0, 2).join(" ")}
                  </td>
                  <Cell>{formatMinutes(s.seconds_played ?? 0)}</Cell>
                  <Cell bold>{s.pts}</Cell>
                  <Cell>{s.fg2_made}/{s.fg2_att}</Cell>
                  <Cell muted>{pct(s.fg2_made, s.fg2_att)}</Cell>
                  <Cell>{s.fg3_made}/{s.fg3_att}</Cell>
                  <Cell muted>{pct(s.fg3_made, s.fg3_att)}</Cell>
                  <Cell>{s.ft_made}/{s.ft_att}</Cell>
                  <Cell muted>{pct(s.ft_made, s.ft_att)}</Cell>
                  <Cell>{s.reb_off + s.reb_def}</Cell>
                  <Cell>{s.ast}</Cell>
                  <Cell>{s.stl}</Cell>
                  <Cell>{s.blk}</Cell>
                  <Cell>{s.tov}</Cell>
                  <Cell>{s.fouls_committed}</Cell>
                  <Cell>{s.fouls_drawn}</Cell>
                  <td className="px-2 py-2 text-center font-bold text-cdpovoa-primary tabular-nums">
                    {Math.round(Number(s.efficiency ?? 0))}
                  </td>
                  <td className={`px-2 py-2 text-center tabular-nums font-semibold ${pm > 0 ? "text-green-600" : pm < 0 ? "text-red-500" : ""}`}>
                    {pm > 0 ? `+${pm}` : pm}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/50 font-bold border-t-2">
              <td className="px-3 py-2 sticky left-0 bg-muted">–</td>
              <td className="px-2 py-2 uppercase tracking-widest text-muted-foreground">Total</td>
              <Cell>–</Cell>
              <Cell bold>{t.pts}</Cell>
              <Cell bold>{t.fg2m}/{t.fg2a}</Cell>
              <Cell bold>{pct(t.fg2m, t.fg2a)}</Cell>
              <Cell bold>{t.fg3m}/{t.fg3a}</Cell>
              <Cell bold>{pct(t.fg3m, t.fg3a)}</Cell>
              <Cell bold>{t.ftm}/{t.fta}</Cell>
              <Cell bold>{pct(t.ftm, t.fta)}</Cell>
              <Cell bold>{t.reb}</Cell>
              <Cell bold>{t.ast}</Cell>
              <Cell bold>{t.stl}</Cell>
              <Cell bold>{t.blk}</Cell>
              <Cell bold>{t.tov}</Cell>
              <Cell bold>{t.fc}</Cell>
              <Cell bold>{t.fd}</Cell>
              <td className="px-2 py-2 text-center font-bold text-cdpovoa-primary">{t.eff}</td>
              <Cell>–</Cell>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        C/T = convertidos/tentados · F = faltas · FS = faltas sofridas · EFF = eficiência
      </p>
    </section>
  );
}
