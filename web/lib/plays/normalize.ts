import { PLAY_CATEGORIES, type Init, type Move, type Pass, type PlayOption, type Pt, type Step } from "@/types/plays";

export interface PlayDraft {
  name: string;
  eyebrow: string | null;
  category: string;
  note: string | null;
  init: Init;
  steps: Record<string, Step>;
  options: PlayOption[];
}

export type NormalizeResult =
  | { ok: true; play: PlayDraft; warnings: string[] }
  | { ok: false; error: string };

const W = 500;
const H = 470;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function pt(v: unknown): Pt | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.round(clamp(x, 0, W)), Math.round(clamp(y, 0, H))];
}
function player(v: unknown): 1 | 2 | 3 | 4 | 5 | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as 1 | 2 | 3 | 4 | 5) : null;
}
function window01(s: unknown, e: unknown): { s: number; e: number } {
  let a = Number(s);
  let b = Number(e);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = 1;
  a = clamp(a, 0, 1);
  b = clamp(b, 0, 1);
  if (b - a < 0.05) { if (a > 0.95) a = 0.9; b = Math.min(1, a + 0.1); }
  return { s: +a.toFixed(2), e: +b.toFixed(2) };
}

/** Valida e corrige a resposta da IA para o formato que o PlayViewer consome. */
export function normalizePlayDraft(raw: unknown): NormalizeResult {
  if (!isObj(raw)) return { ok: false, error: "A IA não devolveu uma jogada válida." };
  const warnings: string[] = [];

  const name = str(raw.name, 80);
  if (!name) return { ok: false, error: "A jogada gerada não tem nome." };
  const category = (PLAY_CATEGORIES as string[]).includes(str(raw.category, 40)) ? str(raw.category, 40) : "Ataque";

  // init
  const rawInit = isObj(raw.init) ? raw.init : {};
  const rawPos = isObj(rawInit.pos) ? rawInit.pos : {};
  const pos: Record<string, Pt> = {};
  const fallback: Record<string, Pt> = { "1": [250, 380], "2": [90, 280], "3": [410, 280], "4": [200, 190], "5": [300, 190] };
  for (const k of ["1", "2", "3", "4", "5"]) {
    const p = pt(rawPos[k]);
    if (!p) warnings.push(`Posição inicial do jogador ${k} em falta; usada uma por defeito.`);
    pos[k] = p ?? fallback[k];
  }
  const ball = player(rawInit.ball) ?? 1;

  // steps
  const rawSteps = isObj(raw.steps) ? raw.steps : {};
  const steps: Record<string, Step> = {};
  for (const [id, v] of Object.entries(rawSteps)) {
    if (!isObj(v)) continue;
    const moves: Move[] = [];
    for (const m of Array.isArray(v.moves) ? v.moves : []) {
      if (!isObj(m)) continue;
      const p = player(m.p);
      const to = pt(m.to);
      if (!p || !to) { warnings.push(`Movimento inválido ignorado no passo ${id}.`); continue; }
      const type = m.type === "dribble" || m.type === "screen" ? m.type : "cut";
      const via = pt(m.via);
      moves.push({ p, to, ...(via ? { via } : {}), type, ...window01(m.s, m.e) });
    }
    const passes: Pass[] = [];
    for (const ps of Array.isArray(v.passes) ? v.passes : []) {
      if (!isObj(ps)) continue;
      const f = player(ps.f);
      const t = player(ps.t);
      if (!f || !t || f === t) { warnings.push(`Passe inválido ignorado no passo ${id}.`); continue; }
      passes.push({ f, t, ...window01(ps.s, ps.e), ...(ps.ho === true ? { ho: true } : {}) });
    }
    const options = (Array.isArray(v.options) ? v.options : []).map(player).filter((n): n is 1 | 2 | 3 | 4 | 5 => n !== null);
    steps[id] = {
      title: str(v.title, 80) || id,
      text: str(v.text, 400),
      ...(moves.length ? { moves } : {}),
      ...(passes.length ? { passes } : {}),
      ...(options.length ? { options } : {}),
    };
  }
  if (Object.keys(steps).length === 0) return { ok: false, error: "A jogada gerada não tem passos." };

  // options
  let options: PlayOption[] = [];
  (Array.isArray(raw.options) ? raw.options : []).forEach((o, i) => {
    if (!isObj(o)) return;
    const ids = (Array.isArray(o.steps) ? o.steps : []).map(String).filter((s) => steps[s]);
    if (ids.length === 0) return;
    options.push({ id: str(o.id, 40) || `opt${i + 1}`, label: str(o.label, 60) || `Opção ${i + 1}`, sub: str(o.sub, 120), steps: ids });
  });
  if (options.length === 0) {
    warnings.push("Sem opções válidas; criada uma opção com todos os passos.");
    options = [{ id: "main", label: "Opção principal", sub: "", steps: Object.keys(steps) }];
  }
  const seen = new Set<string>();
  options = options.map((o, i) => {
    let id = o.id;
    while (seen.has(id)) id = `${o.id}-${i + 1}`;
    seen.add(id);
    return { ...o, id };
  });

  return {
    ok: true,
    warnings,
    play: { name, eyebrow: str(raw.eyebrow, 120) || null, category, note: str(raw.note, 400) || null, init: { pos, ball }, steps, options },
  };
}
