import Link from "next/link";
import { TeamMono } from "@/components/competitions/team-mono";
import type { CupGame, CupRound, CupTeam } from "@/lib/cup";

/**
 * Quadro da Taça da Liga INATEL (eliminatórias), no estilo dos quadros de playoffs NBA/FIFA:
 * colunas por ronda, cartões de jogo com resultado, ligações a convergir até à final e ao campeão.
 * Geometria fixa (px) + SVG para as ligações; em ecrãs pequenos desliza na horizontal.
 */

const W = 244;        // largura do cartão
const G = 60;         // espaço entre colunas (ligações)
const RH = 108;       // altura de uma "linha" da 1ª ronda
const CARD_H = 88;    // altura do cartão
const HEAD_H = 46;    // cabeçalho das colunas

type Theme = "light" | "dark";

const PALETTE = {
  light: {
    card: "#FFFDFA", border: "#DDD3C6", text: "#1A1612", muted: "#8C837A",
    line: "#CFC4B5", head: "#6F675F", stripe: "#F4EFE8", dashed: "#C9BDAE",
  },
  dark: {
    card: "#1E1814", border: "rgba(255,255,255,.14)", text: "#F6F2EC", muted: "#9A9087",
    line: "rgba(255,255,255,.2)", head: "#B9AFA4", stripe: "rgba(255,255,255,.04)", dashed: "rgba(255,255,255,.25)",
  },
} as const;
const ACCENT = "#F97316";

const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatCupDate(date: string, opts?: { note?: string | null; tbc?: boolean }) {
  const d = new Date(`${date}T12:00:00`);
  if (opts?.tbc && opts.note) return opts.note.split("·")[0].trim();
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

type Cell =
  | { kind: "game"; game: CupGame }
  | { kind: "bye"; team: CupTeam };

/** Posições da 1ª ronda: segue as origens dos jogos seguintes; equipa fixa sem origem = isenta. */
function buildCells(rounds: CupRound[]): Cell[][] {
  const out: Cell[][] = [];
  rounds.forEach((r, k) => {
    if (k === 0 && rounds.length > 1) {
      const byNum = new Map(r.games.map((g) => [g.num, g]));
      const cells: Cell[] = [];
      for (const next of rounds[1].games) {
        for (const side of ["home", "away"] as const) {
          const src = side === "home" ? next.homeSource : next.awaySource;
          const g = src != null ? byNum.get(src) : undefined;
          cells.push(g ? { kind: "game", game: g } : { kind: "bye", team: next[side] });
        }
      }
      // Jogos da 1ª ronda que não alimentam nenhum jogo (dados incompletos): acrescentar no fim
      const used = new Set(cells.flatMap((c) => (c.kind === "game" ? [c.game.num] : [])));
      for (const g of r.games) if (!used.has(g.num)) cells.push({ kind: "game", game: g });
      out.push(cells);
    } else {
      out.push(r.games.map((game) => ({ kind: "game", game }) as Cell));
    }
  });
  return out;
}

function TeamRow({
  team, score, isWinner, isLoser, theme,
}: { team: CupTeam; score: number | null; isWinner: boolean; isLoser: boolean; theme: Theme }) {
  const p = PALETTE[theme];
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, height: 30, padding: "0 10px",
        background: isWinner ? `${ACCENT}14` : "transparent",
        borderLeft: `3px solid ${isWinner ? ACCENT : "transparent"}`,
        opacity: isLoser ? 0.55 : 1,
      }}
    >
      {team.placeholder ? (
        <span
          aria-hidden
          style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px dashed ${p.dashed}`, flexShrink: 0 }}
        />
      ) : (
        <TeamMono name={team.name} size={20} logoUrl={team.logoUrl} />
      )}
      <span
        title={team.name}
        style={{
          flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
          fontWeight: isWinner ? 800 : 700, fontSize: 14, letterSpacing: ".03em", textTransform: "uppercase",
          color: team.placeholder ? p.muted : p.text,
          fontStyle: team.placeholder ? "italic" : "normal",
        }}
      >
        {team.name}
      </span>
      <span
        style={{
          fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
          fontWeight: 800, fontSize: 17, minWidth: 24, textAlign: "right",
          fontVariantNumeric: "tabular-nums", color: isWinner ? ACCENT : p.text,
        }}
      >
        {score ?? ""}
      </span>
    </div>
  );
}

function GameCard({
  game, theme, href, top, left,
}: { game: CupGame; theme: Theme; href: string | null; top: number; left: number }) {
  const p = PALETTE[theme];
  const when = [
    formatCupDate(game.date, { note: game.dateNote, tbc: game.dateTbc }),
    game.time,
  ].filter(Boolean).join(" · ");

  const body = (
    <div
      style={{
        position: "absolute", top, left, width: W, height: CARD_H, boxSizing: "border-box",
        background: p.card, border: `1px solid ${game.isOurGame ? `${ACCENT}88` : p.border}`,
        borderRadius: 8, overflow: "hidden",
        boxShadow: game.isOurGame ? `0 0 0 1px ${ACCENT}33` : "0 1px 2px rgba(0,0,0,.06)",
      }}
    >
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", height: 26, padding: "0 10px",
          background: p.stripe, borderBottom: `1px solid ${p.border}`,
          fontFamily: "var(--font-ibm-mono, monospace)", fontSize: 10, letterSpacing: ".06em",
          textTransform: "uppercase", color: p.muted,
        }}
      >
        <span style={{ color: p.head, fontWeight: 600 }}>Taça {game.num}</span>
        <span>
          {game.status === "live" ? (
            <span style={{ color: ACCENT, fontWeight: 700 }}>● Ao vivo</span>
          ) : (
            when
          )}
        </span>
      </div>
      <TeamRow
        team={game.home} score={game.result?.home ?? null}
        isWinner={game.winner === "home"} isLoser={game.winner === "away"} theme={theme}
      />
      <TeamRow
        team={game.away} score={game.result?.away ?? null}
        isWinner={game.winner === "away"} isLoser={game.winner === "home"} theme={theme}
      />
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }} aria-label={`Taça ${game.num}: ${game.home.name} vs ${game.away.name}`}>
      {body}
    </Link>
  );
}

function ByeCard({ team, theme, top, left }: { team: CupTeam; theme: Theme; top: number; left: number }) {
  const p = PALETTE[theme];
  return (
    <div
      style={{
        position: "absolute", top, left, width: W, height: CARD_H, boxSizing: "border-box",
        border: `1.5px dashed ${p.dashed}`, borderRadius: 8, overflow: "hidden", opacity: 0.95,
      }}
    >
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", height: 26, padding: "0 10px",
          fontFamily: "var(--font-ibm-mono, monospace)", fontSize: 10, letterSpacing: ".06em",
          textTransform: "uppercase", color: p.muted,
        }}
      >
        <span style={{ fontWeight: 600 }}>Isenta</span>
        <span>Entra nos quartos</span>
      </div>
      <TeamRow team={team} score={null} isWinner={false} isLoser={false} theme={theme} />
    </div>
  );
}

function Trophy({ size = 40, color = ACCENT }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M14 6h20v10a10 10 0 0 1-20 0V6Z" fill={color} />
      <path d="M14 9H7v3a7 7 0 0 0 7 7M34 9h7v3a7 7 0 0 1-7 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 26v7M17 41h14M19 33h10v8H19z" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  rounds: CupRound[];
  champion?: CupTeam | null;
  theme?: Theme;
  /** Ligação do cartão (por omissão só jogos com resultado, para a página do jogo da Liga INATEL). */
  hrefFor?: (g: CupGame) => string | null;
}

export function CupBracket({
  rounds, champion = null, theme = "light",
  hrefFor = (g) => (g.status === "finished" ? `/liga-inatel/jogo/${g.id}` : null),
}: Props) {
  if (rounds.length === 0) return null;
  const p = PALETTE[theme];
  const cells = buildCells(rounds);
  const rows = Math.max(cells[0].length, 1);
  const cols = rounds.length + 1; // + coluna do campeão
  const width = cols * W + (cols - 1) * G;
  const height = HEAD_H + rows * RH;

  const colX = (k: number) => k * (W + G);
  const centerY = (k: number, i: number) => HEAD_H + (i * 2 ** k + 2 ** k / 2) * RH;
  const cardTop = (k: number, i: number) => centerY(k, i) - CARD_H / 2;

  // Ligações: cada cartão liga ao jogo seguinte (índice i → floor(i/2))
  const paths: { d: string; on: boolean }[] = [];
  cells.forEach((col, k) => {
    col.forEach((cell, i) => {
      const x1 = colX(k) + W;
      const y1 = centerY(k, i);
      const last = k === cells.length - 1;
      const x2 = colX(k + 1);
      const y2 = last ? centerY(k, i) : centerY(k + 1, Math.floor(i / 2));
      const xm = x1 + G / 2;
      const decided = cell.kind === "game" && cell.game.winner !== null;
      paths.push({ d: `M${x1} ${y1} H${xm} V${y2} H${x2}`, on: decided });
    });
  });

  const lastRound = rounds[rounds.length - 1];

  return (
    <div
      role="group"
      aria-label="Quadro da Taça da Liga INATEL"
      style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 8 }}
    >
      <div style={{ position: "relative", width, height, margin: "0 auto" }}>
        {/* Cabeçalhos das rondas */}
        {rounds.map((r, k) => (
          <div
            key={`h-${r.round}`}
            style={{
              position: "absolute", top: 0, left: colX(k), width: W, height: HEAD_H - 10,
              display: "flex", alignItems: "flex-end", justifyContent: "center",
              borderBottom: `2px solid ${k === rounds.length - 1 ? ACCENT : p.border}`,
              paddingBottom: 6,
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 800, fontSize: 15, letterSpacing: ".1em", textTransform: "uppercase", color: p.text,
            }}
          >
            {r.short}
          </div>
        ))}
        <div
          style={{
            position: "absolute", top: 0, left: colX(rounds.length), width: W, height: HEAD_H - 10,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            borderBottom: `2px solid ${ACCENT}`, paddingBottom: 6,
            fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
            fontWeight: 800, fontSize: 15, letterSpacing: ".1em", textTransform: "uppercase", color: ACCENT,
          }}
        >
          Campeão
        </div>

        {/* Ligações */}
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
          {paths.map((pt, i) => (
            <path key={i} d={pt.d} fill="none" stroke={pt.on ? ACCENT : p.line} strokeWidth={pt.on ? 2 : 1.5} />
          ))}
        </svg>

        {/* Cartões */}
        {cells.map((col, k) =>
          col.map((cell, i) =>
            cell.kind === "game" ? (
              <GameCard
                key={`g-${cell.game.id}`}
                game={cell.game} theme={theme} href={hrefFor(cell.game)}
                top={cardTop(k, i)} left={colX(k)}
              />
            ) : (
              <ByeCard key={`b-${k}-${i}`} team={cell.team} theme={theme} top={cardTop(k, i)} left={colX(k)} />
            )
          )
        )}

        {/* Campeão */}
        <div
          style={{
            position: "absolute", left: colX(rounds.length), width: W, height: CARD_H + 24, boxSizing: "border-box",
            top: centerY(cells.length - 1, 0) - (CARD_H + 24) / 2,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            border: `1.5px solid ${champion ? ACCENT : p.border}`, borderRadius: 10,
            background: champion ? `${ACCENT}12` : p.card,
          }}
        >
          <Trophy size={34} color={champion ? ACCENT : p.dashed} />
          {champion ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TeamMono name={champion.name} size={24} logoUrl={champion.logoUrl} />
              <span
                style={{
                  fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
                  fontWeight: 800, fontSize: 16, letterSpacing: ".04em", textTransform: "uppercase", color: p.text,
                }}
              >
                {champion.name}
              </span>
            </div>
          ) : (
            <span style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: p.muted }}>
              Vencedor da {lastRound.short}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lista de jogos por eliminatória (calendário + resultados), mesma identidade visual. */
export function CupGameList({
  rounds, theme = "light", hrefFor = (g) => (g.status === "finished" ? `/liga-inatel/jogo/${g.id}` : null),
}: Pick<Props, "rounds" | "theme" | "hrefFor">) {
  const p = PALETTE[theme ?? "light"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {rounds.map((r) => (
        <section key={r.round} aria-label={r.name}>
          <h3
            style={{
              margin: "0 0 10px", paddingBottom: 6, borderBottom: `2px solid ${p.border}`,
              fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))",
              fontWeight: 800, fontSize: 18, letterSpacing: ".08em", textTransform: "uppercase", color: p.text,
            }}
          >
            {r.name}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {r.games
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.num - b.num)
              .map((g) => {
                const href = hrefFor?.(g) ?? null;
                const row = (
                  <div
                    style={{
                      display: "grid", gridTemplateColumns: "minmax(86px, 120px) 1fr", gap: 14, alignItems: "center",
                      padding: "10px 12px", background: p.card, borderRadius: 8,
                      border: `1px solid ${g.isOurGame ? `${ACCENT}88` : p.border}`,
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: p.muted, lineHeight: 1.5 }}>
                      <div style={{ color: p.head, fontWeight: 600 }}>Taça {g.num}</div>
                      <div>{formatCupDate(g.date, { note: g.dateNote, tbc: g.dateTbc })}</div>
                      <div>{g.status === "live" ? <span style={{ color: ACCENT, fontWeight: 700 }}>● Ao vivo</span> : g.time ?? "Hora a definir"}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      {(([["home", g.home, g.result?.home], ["away", g.away, g.result?.away]]) as ["home" | "away", CupTeam, number | undefined][]).map(([side, team, sc]) => {
                        const won = g.winner === side;
                        return (
                          <div key={side} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", opacity: g.winner && !won ? 0.55 : 1 }}>
                            {team.placeholder ? (
                              <span aria-hidden style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px dashed ${p.dashed}`, flexShrink: 0 }} />
                            ) : (
                              <TeamMono name={team.name} size={20} logoUrl={team.logoUrl} />
                            )}
                            <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))", fontWeight: won ? 800 : 700, fontSize: 15, letterSpacing: ".03em", textTransform: "uppercase", color: team.placeholder ? p.muted : p.text, fontStyle: team.placeholder ? "italic" : "normal" }}>
                              {team.name}
                            </span>
                            <span style={{ fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))", fontWeight: 800, fontSize: 18, fontVariantNumeric: "tabular-nums", color: won ? ACCENT : p.text }}>
                              {sc ?? ""}
                            </span>
                          </div>
                        );
                      })}
                      <div style={{ marginTop: 4, fontFamily: "var(--font-ibm-mono, monospace)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: p.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.venue
                          ? `${g.venue}${g.locality ? ` · ${g.locality}` : ""}`
                          : r.round === rounds[rounds.length - 1].round ? "Pavilhão neutro · a definir" : "Pavilhão a definir"}
                      </div>
                    </div>
                  </div>
                );
                return href ? (
                  <Link key={g.id} href={href} style={{ textDecoration: "none", color: "inherit" }}>{row}</Link>
                ) : (
                  <div key={g.id}>{row}</div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
