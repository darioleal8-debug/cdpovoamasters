/**
 * Plantel das equipas da Liga INATEL (league_team_players), gerido pelos delegados.
 * Usado na página pública da equipa e como referência na leitura das folhas/estatísticas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PLAYER_PHOTOS_BUCKET = "league-player-photos";
export const MAX_PLAYER_PHOTO_BYTES = 5 * 1024 * 1024;

export interface RosterPlayer {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  number: number | null;
  photoUrl: string | null;
  /** "hoophub" = plantel da época ativa na app de gestão (só leitura aqui); "liga" = registado pelo delegado */
  source: "hoophub" | "liga";
}

type Row = { id: string; team_id: string; first_name: string; last_name: string; number: number | null; photo_path: string | null };

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function photoUrl(db: SupabaseClient, path: string | null): string | null {
  if (!path) return null;
  return db.storage.from(PLAYER_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl ?? null;
}

function toPlayer(db: SupabaseClient, r: Row): RosterPlayer {
  return { id: r.id, teamId: r.team_id, firstName: r.first_name, lastName: r.last_name, number: r.number, photoUrl: photoUrl(db, r.photo_path), source: "liga" };
}

/** "João Pedro Silva" → primeiro nome "João", último nome "Pedro Silva" (nomes simples ficam só com o primeiro). */
export function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().replace(/\s+/g, " ").split(" ");
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/**
 * Plantel da época ativa na app de gestão HoopHub para uma equipa da liga (seasons.league_team_id).
 * Só equipas que usam a HoopHub têm isto; contas de teste ficam de fora. Precisa de cliente com
 * acesso às tabelas da HoopHub (service role).
 */
export async function loadHoophubRoster(db: SupabaseClient, teamId: string): Promise<RosterPlayer[]> {
  const { data: seasons } = await db.from("seasons").select("id").eq("league_team_id", teamId).eq("status", "ativa");
  const seasonIds = (seasons ?? []).map((s) => s.id as string);
  if (!seasonIds.length) return [];
  const { data: rows } = await db.from("v_active_roster").select("player_id, name, number").in("season_id", seasonIds);
  const active = (rows ?? []).filter((r) => typeof r.name === "string" && (r.name as string).trim());
  if (!active.length) return [];
  const { data: photos } = await db.from("players").select("id, photo_url, processed_photo_url").in("id", active.map((r) => r.player_id as string));
  const photoById = new Map((photos ?? []).map((p) => [p.id as string, ((p.processed_photo_url ?? p.photo_url) as string | null) ?? null]));
  return active
    .map((r) => ({
      id: r.player_id as string,
      teamId,
      ...splitFullName(r.name as string),
      number: (r.number as number | null) ?? null,
      photoUrl: photoById.get(r.player_id as string) ?? null,
      source: "hoophub" as const,
    }))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.lastName.localeCompare(b.lastName, "pt"));
}

/**
 * Plantel ativo de uma equipa, por número. Se a equipa usa a HoopHub e tem plantel na época ativa,
 * é esse o plantel da liga (fonte única); caso contrário, o registado pelo delegado.
 * `hoophubDb` precisa de acesso às tabelas da HoopHub (por defeito, o próprio `db`).
 */
export async function loadTeamRoster(db: SupabaseClient, teamId: string, hoophubDb: SupabaseClient = db): Promise<RosterPlayer[]> {
  const hoophub = await loadHoophubRoster(hoophubDb, teamId).catch(() => []);
  if (hoophub.length) return hoophub;
  const { data } = await db
    .from("league_team_players")
    .select("id, team_id, first_name, last_name, number, photo_path")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("number", { ascending: true, nullsFirst: false })
    .order("last_name", { ascending: true });
  return ((data ?? []) as Row[]).map((r) => toPlayer(db, r));
}

/** Planteis das duas equipas de um jogo (vazio quando a equipa não registou jogadores). */
export async function loadGameRosters(db: SupabaseClient, teams: { homeTeamId: string | null; awayTeamId: string | null }): Promise<{ home: RosterPlayer[]; away: RosterPlayer[] }> {
  const [home, away] = await Promise.all([
    teams.homeTeamId ? loadTeamRoster(db, teams.homeTeamId).catch(() => []) : Promise.resolve([]),
    teams.awayTeamId ? loadTeamRoster(db, teams.awayTeamId).catch(() => []) : Promise.resolve([]),
  ]);
  return { home, away };
}

/**
 * Texto do plantel para o prompt do DeepSeek: referência para confirmar a leitura de nomes e
 * números — nunca para acrescentar jogadores que não estão no documento.
 */
export function rosterPromptBlock(rosters: { home: RosterPlayer[]; away: RosterPlayer[] }, game: { home: string; away: string }): string {
  const parts: string[] = [];
  for (const side of ["home", "away"] as const) {
    const r = rosters[side];
    if (!r.length) continue;
    parts.push(`${game[side]}: ${r.map((p) => `${p.number !== null ? `#${p.number} ` : ""}${fullName(p)}`).join("; ")}`);
  }
  if (!parts.length) return "";
  return [
    "PLANTEL REGISTADO PELAS EQUIPAS (referência para confirmar números e nomes):",
    ...parts,
    "Usa o plantel para desambiguar letra ilegível e associar número ↔ nome (ex.: '#4 Af…' → Afonso). NÃO acrescentes jogadores que não aparecem no documento e não alteres números/valores escritos só para coincidir com o plantel; se o número lido e o nome não coincidirem com o plantel, mantém o que está escrito e explica em \"warnings\".",
  ].join("\n");
}

/** Normaliza e valida os campos de um jogador. */
export function parsePlayerFields(input: { first_name?: unknown; last_name?: unknown; number?: unknown }, partial = false):
  { ok: true; value: { first_name?: string; last_name?: string; number?: number } } | { ok: false; error: string } {
  const out: { first_name?: string; last_name?: string; number?: number } = {};
  const name = (v: unknown, label: string): string | { error: string } | undefined => {
    if (v === undefined || v === null) return partial ? undefined : { error: `${label} obrigatório` };
    const s = String(v).trim().replace(/\s+/g, " ");
    if (!s) return { error: `${label} obrigatório` };
    if (s.length > 60) return { error: `${label} demasiado longo (máx. 60)` };
    if (!/^[\p{L}][\p{L}\p{M}' .-]*$/u.test(s)) return { error: `${label} inválido (só letras, espaços, hífen e apóstrofo)` };
    return s;
  };
  const f = name(input.first_name, "Primeiro nome");
  if (typeof f === "object") return { ok: false, error: f.error };
  if (f !== undefined) out.first_name = f;
  const l = name(input.last_name, "Último nome");
  if (typeof l === "object") return { ok: false, error: l.error };
  if (l !== undefined) out.last_name = l;
  if (input.number === undefined || input.number === null || input.number === "") {
    if (!partial) return { ok: false, error: "Número obrigatório" };
  } else {
    const n = Number(input.number);
    if (!Number.isInteger(n) || n < 0 || n > 99) return { ok: false, error: "Número inválido (0–99)" };
    out.number = n;
  }
  return { ok: true, value: out };
}
