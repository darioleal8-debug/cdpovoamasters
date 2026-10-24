"use client";

import { useId, useRef, useState, useEffect, useCallback, useMemo } from "react";
import type { Init, Step, PlayOption } from "@/types/plays";

// ── Local types ───────────────────────────────────────────────────────────────
type Pt = [number, number];
type GameState = { pos: Map<number, Pt>; ball: number };

// ── Math helpers ──────────────────────────────────────────────────────────────
const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const quad = (a: Pt, c: Pt, b: Pt, t: number): Pt => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const f2 = (n: number) => n.toFixed(2);

// ── Animation engine (pure functions, outside component) ──────────────────────

function build(init: Init, stepSeq: Step[]): GameState[] {
  const p0 = new Map<number, Pt>();
  for (const [k, v] of Object.entries(init.pos)) p0.set(Number(k), v as Pt);
  const states: GameState[] = [{ pos: new Map(p0), ball: Number(init.ball) }];
  for (const step of stepSeq) {
    const prev = states[states.length - 1];
    const newPos = new Map(prev.pos);
    const sorted = [...(step.moves ?? [])].sort((a, b) => a.s - b.s);
    for (const m of sorted) newPos.set(m.p, m.to);
    let ball = prev.ball;
    for (const pass of (step.passes ?? [])) ball = pass.t;
    states.push({ pos: newPos, ball });
  }
  return states;
}

function posAt(state: GameState, step: Step, p: number, t: number): Pt {
  const pm = (step.moves ?? []).filter(m => m.p === p).sort((a, b) => a.s - b.s);
  if (!pm.length) return state.pos.get(p) ?? [250, 235];
  let from: Pt = [...(state.pos.get(p) ?? [250, 235])] as Pt;
  for (const m of pm) {
    const via = m.via ?? mid(from, m.to);
    if (t >= m.e) { from = m.to; continue; }
    if (t >= m.s) return quad(from, via, m.to, ease((t - m.s) / (m.e - m.s)));
    return from;
  }
  return from;
}

function ballAt(state: GameState, step: Step, t: number): Pt {
  let holder = state.ball;
  const passes = [...(step.passes ?? [])].sort((a, b) => a.s - b.s);
  for (const pass of passes) {
    if (t >= pass.e) { holder = pass.t; continue; }
    if (t >= pass.s) {
      const fp = posAt(state, step, pass.f, t);
      const tp = posAt(state, step, pass.t, t);
      const lt = ease((t - pass.s) / (pass.e - pass.s));
      return [fp[0] + (tp[0] - fp[0]) * lt, fp[1] + (tp[1] - fp[1]) * lt];
    }
  }
  const hp = posAt(state, step, holder, t);
  return [hp[0] + 10, hp[1] + 9];
}

const PR = 15; // player circle radius
const SAMPLES = 40;

function tangentAt(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const dx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]);
  const dy = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
  const len = Math.hypot(dx, dy);
  return len < 0.001 ? [1, 0] : [dx / len, dy / len];
}

// Find curve parameter where distance from `from` ≈ targetDist
function curveStartT(from: Pt, via: Pt, to: Pt, targetDist: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const tm = (lo + hi) / 2;
    const pt = quad(from, via, to, tm);
    const d = Math.hypot(pt[0] - from[0], pt[1] - from[1]);
    if (d < targetDist) lo = tm; else hi = tm;
  }
  return (lo + hi) / 2;
}

function buildTrailsHTML(step: Step, state: GameState, t: number, uid: string): string {
  let html = "";
  const arr = `url(#arr-${uid})`;

  // ── Moves ──
  const lastPos = new Map<number, Pt>(state.pos);
  const sortedMoves = [...(step.moves ?? [])].sort((a, b) => a.s - b.s);

  for (const m of sortedMoves) {
    const from: Pt = [...(lastPos.get(m.p) ?? state.pos.get(m.p) ?? [250, 235])] as Pt;
    const to: Pt = m.to;
    const via: Pt = m.via ?? mid(from, to);
    const op = t >= m.s ? 1 : 0.28;
    const tStart = curveStartT(from, via, to, PR + 5);

    if (m.type === "cut") {
      const pts: string[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const tc = tStart + (1 - tStart) * i / SAMPLES;
        const [x, y] = quad(from, via, to, tc);
        pts.push(`${f2(x)},${f2(y)}`);
      }
      html += `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--pv-trail)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" marker-end="${arr}" opacity="${op}"/>`;

    } else if (m.type === "dribble") {
      const pts: string[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const tc = tStart + (1 - tStart) * i / SAMPLES;
        const base = quad(from, via, to, tc);
        const tang = tangentAt(from, via, to, tc);
        const nx = -tang[1], ny = tang[0];
        const wave = Math.sin(i * 1.6) * 4.5;
        pts.push(`${f2(base[0] + nx * wave)},${f2(base[1] + ny * wave)}`);
      }
      html += `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--pv-trail)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" marker-end="${arr}" opacity="${op}"/>`;

    } else if (m.type === "screen") {
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const len = Math.hypot(dx, dy);
      if (len > 0.5) {
        const ux = dx / len, uy = dy / len;
        const sx = from[0] + ux * (PR + 5), sy = from[1] + uy * (PR + 5);
        html += `<line x1="${f2(sx)}" y1="${f2(sy)}" x2="${f2(to[0])}" y2="${f2(to[1])}" stroke="var(--pv-trail)" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="${op}"/>`;
        const nx = -uy, ny = ux;
        html += `<line x1="${f2(to[0] - nx * 10)}" y1="${f2(to[1] - ny * 10)}" x2="${f2(to[0] + nx * 10)}" y2="${f2(to[1] + ny * 10)}" stroke="var(--pv-trail)" stroke-width="3" stroke-linecap="round" opacity="${op}"/>`;
      }
    }

    lastPos.set(m.p, to);
  }

  // ── Passes ──
  const PTRIM = 17;
  for (const pass of (step.passes ?? [])) {
    const fp = posAt(state, step, pass.f, t);
    const tp = posAt(state, step, pass.t, t);
    const dx = tp[0] - fp[0], dy = tp[1] - fp[1];
    const len = Math.hypot(dx, dy);
    if (len < 2) continue;
    const ux = dx / len, uy = dy / len;
    const sx = fp[0] + ux * PTRIM, sy = fp[1] + uy * PTRIM;
    const ex = tp[0] - ux * PTRIM, ey = tp[1] - uy * PTRIM;
    if (pass.ho) {
      html += `<line x1="${f2(sx)}" y1="${f2(sy)}" x2="${f2(ex)}" y2="${f2(ey)}" stroke="var(--pv-trail)" stroke-width="2.4" stroke-dasharray="4 3" stroke-linecap="round" fill="none" marker-end="${arr}"/>`;
      const mx = (fp[0] + tp[0]) / 2, my = (fp[1] + tp[1]) / 2;
      const nx = -uy, ny = ux;
      html += `<line x1="${f2(mx - nx * 5 - ux * 4)}" y1="${f2(my - ny * 5 - uy * 4)}" x2="${f2(mx + nx * 5 - ux * 4)}" y2="${f2(my + ny * 5 - uy * 4)}" stroke="var(--pv-trail)" stroke-width="2" stroke-linecap="round"/>`;
      html += `<line x1="${f2(mx - nx * 5 + ux * 4)}" y1="${f2(my - ny * 5 + uy * 4)}" x2="${f2(mx + nx * 5 + ux * 4)}" y2="${f2(my + ny * 5 + uy * 4)}" stroke="var(--pv-trail)" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      html += `<line x1="${f2(sx)}" y1="${f2(sy)}" x2="${f2(ex)}" y2="${f2(ey)}" stroke="var(--pv-trail)" stroke-width="2.4" stroke-dasharray="4 3" stroke-linecap="round" fill="none" marker-end="${arr}"/>`;
    }
  }

  // ── Optional pass lines at end of step ──
  if (step.options) {
    let holder = state.ball;
    for (const pass of (step.passes ?? [])) holder = pass.t;
    const hp = posAt(state, step, holder, 1);
    for (const targetP of step.options) {
      const tp = posAt(state, step, targetP, 1);
      const dx = tp[0] - hp[0], dy = tp[1] - hp[1];
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const ux = dx / len, uy = dy / len;
      html += `<line x1="${f2(hp[0] + ux * PR)}" y1="${f2(hp[1] + uy * PR)}" x2="${f2(tp[0] - ux * PR)}" y2="${f2(tp[1] - uy * PR)}" stroke="var(--pv-trail)" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round" fill="none" opacity="0.35" marker-end="${arr}"/>`;
    }
  }

  return html;
}

function drawFrame(
  si: number, t: number,
  stepSeq: Step[], states: GameState[],
  trailsEl: SVGGElement, playersEl: SVGGElement, ballEl: SVGCircleElement,
  uid: string
): void {
  const step = stepSeq[si], state = states[si];
  if (!step || !state) return;

  trailsEl.innerHTML = buildTrailsHTML(step, state, t, uid);

  let ph = "";
  for (let p = 1; p <= 5; p++) {
    const [cx, cy] = posAt(state, step, p, t);
    ph += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${PR}" fill="var(--pv-player)" stroke="var(--pv-panel)" stroke-width="1.5"/>`;
    ph += `<text x="${f2(cx)}" y="${f2(cy + 5)}" text-anchor="middle" fill="var(--pv-player-num)" font-family="'Barlow Condensed',sans-serif" font-weight="700" font-size="14">${p}</text>`;
  }
  playersEl.innerHTML = ph;

  const [bx, by] = ballAt(state, step, t);
  ballEl.setAttribute("cx", bx.toFixed(1));
  ballEl.setAttribute("cy", by.toFixed(1));
}

// ── Token sets ────────────────────────────────────────────────────────────────
const TK_LIGHT: Record<string, string> = {
  "--pv-bg":         "#f3f1ec",
  "--pv-panel":      "#ffffff",
  "--pv-ink":        "#1c2740",
  "--pv-muted":      "#5d6782",
  "--pv-line":       "#d9dce4",
  "--pv-court":      "#e8d3ab",
  "--pv-court-line": "#1c2740",
  "--pv-paint":      "#c9d6ec",
  "--pv-trail":      "#1c2740",
  "--pv-accent":     "#1f4fa3",
  "--pv-gold":       "#c9a23a",
  "--pv-player":     "#1f4fa3",
  "--pv-player-num": "#ffffff",
  "--pv-ball":       "#e0752d",
};
const TK_DARK: Record<string, string> = {
  "--pv-bg":         "#11151d",
  "--pv-panel":      "#1a202b",
  "--pv-ink":        "#e7ebf3",
  "--pv-muted":      "#9aa3b8",
  "--pv-line":       "#2b3342",
  "--pv-court":      "#262c38",
  "--pv-court-line": "#cdd5e4",
  "--pv-paint":      "#2e3d5a",
  "--pv-trail":      "#f1e3b5",
  "--pv-accent":     "#7ea6ee",
  "--pv-gold":       "#d8b452",
  "--pv-player":     "#d8b452",
  "--pv-player-num": "#141821",
  "--pv-ball":       "#f08a43",
};

// ── Component ─────────────────────────────────────────────────────────────────
interface PlayViewerProps {
  name: string;
  eyebrow?: string | null;
  note?: string | null;
  init: Init;
  steps: Record<string, Step>;
  options: PlayOption[];
}

export function PlayViewer({ name, eyebrow, note, init, steps, options }: PlayViewerProps) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");

  // DOM refs
  const trailsRef  = useRef<SVGGElement>(null);
  const playersRef = useRef<SVGGElement>(null);
  const ballRef    = useRef<SVGCircleElement>(null);
  const rafRef     = useRef<number>(0);
  const wrapRef    = useRef<HTMLDivElement>(null);

  // Mutable animation state (avoid stale closures)
  const animRef = useRef({ running: false, inGap: false, gapStart: 0, startTime: 0, speed: 1 as 0.5 | 1, stepIdx: 0 });

  // React state for rendering
  const [activeOption, setActiveOption] = useState(0);
  const [stepIdx, setStepIdx]           = useState(0);
  const [playing, setPlaying]           = useState(false);
  const [speed, setSpeed]               = useState<0.5 | 1>(1);
  const [isDark, setIsDark]             = useState(false);
  const [isNarrow, setIsNarrow]         = useState(false);
  const reducedRef = useRef(false);

  // Derived
  const option  = options[Math.min(activeOption, options.length - 1)] ?? options[0];
  const stepSeq = useMemo(() => option.steps.map(id => steps[id]).filter(Boolean), [option, steps]);
  const states  = useMemo(() => build(init, stepSeq), [init, stepSeq]);
  const curStep = stepSeq[stepIdx];

  // Keep animRef.speed in sync
  useEffect(() => { animRef.current.speed = speed; }, [speed]);

  // Theme detection
  useEffect(() => {
    function detect() {
      const th = document.documentElement.dataset.theme;
      if (th === "dark")  { setIsDark(true);  return; }
      if (th === "light") { setIsDark(false); return; }
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    detect();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", detect);
    const mo = new MutationObserver(detect);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => { mq.removeEventListener("change", detect); mo.disconnect(); };
  }, []);

  // Reduced motion
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Responsive width
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setIsNarrow(e.contentRect.width < 760));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Draw on step/option change (static view at t=0)
  useEffect(() => {
    if (animRef.current.running) return;
    animRef.current.stepIdx = stepIdx;
    if (trailsRef.current && playersRef.current && ballRef.current) {
      drawFrame(stepIdx, 0, stepSeq, states, trailsRef.current, playersRef.current, ballRef.current, uid);
    }
  }, [stepIdx, stepSeq, states, uid]);

  // Cancel RAF + reset on option change
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    animRef.current.running = false;
    animRef.current.inGap   = false;
    animRef.current.stepIdx = 0;
    setPlaying(false);
    setStepIdx(0);
  }, [activeOption]);

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Controls ──────────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    const anim = animRef.current;
    if (anim.running) {
      anim.running = false;
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      return;
    }
    if (reducedRef.current) {
      if (trailsRef.current && playersRef.current && ballRef.current)
        drawFrame(anim.stepIdx, 1, stepSeq, states, trailsRef.current, playersRef.current, ballRef.current, uid);
      return;
    }
    anim.running   = true;
    anim.inGap     = false;
    anim.startTime = performance.now();
    setPlaying(true);

    // Create tick capturing current stepSeq/states
    const tick: FrameRequestCallback = (now) => {
      if (!anim.running) return;
      if (anim.inGap) {
        if (now - anim.gapStart < 400) { rafRef.current = requestAnimationFrame(tick); return; }
        anim.inGap = false;
        const next = anim.stepIdx + 1;
        if (next >= stepSeq.length) {
          anim.running = false;
          setPlaying(false);
          if (trailsRef.current && playersRef.current && ballRef.current)
            drawFrame(anim.stepIdx, 1, stepSeq, states, trailsRef.current, playersRef.current, ballRef.current, uid);
          return;
        }
        anim.stepIdx = next;
        setStepIdx(next);
        anim.startTime = now;
      }
      const STEP_MS = 2200 / anim.speed;
      const tv = Math.min(1, (now - anim.startTime) / STEP_MS);
      if (trailsRef.current && playersRef.current && ballRef.current)
        drawFrame(anim.stepIdx, tv, stepSeq, states, trailsRef.current, playersRef.current, ballRef.current, uid);
      if (tv >= 1) { anim.inGap = true; anim.gapStart = now; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stepSeq, states, uid]);

  const handlePrev = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    animRef.current.running = false;
    setPlaying(false);
    setStepIdx(prev => {
      const next = Math.max(0, prev - 1);
      animRef.current.stepIdx = next;
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    animRef.current.running = false;
    setPlaying(false);
    setStepIdx(prev => {
      const next = Math.min(stepSeq.length - 1, prev + 1);
      animRef.current.stepIdx = next;
      return next;
    });
  }, [stepSeq.length]);

  const handleRestart = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    animRef.current.running = false;
    animRef.current.stepIdx = 0;
    setPlaying(false);
    setStepIdx(0);
  }, []);

  const handleStepClick = useCallback((idx: number) => {
    cancelAnimationFrame(rafRef.current);
    animRef.current.running = false;
    animRef.current.stepIdx = idx;
    setPlaying(false);
    setStepIdx(idx);
  }, []);

  // ── Title: last word in accent color ──────────────────────────────────────
  const titleWords = name.split(" ");
  const titleMain  = titleWords.slice(0, -1).join(" ");
  const titleLast  = titleWords[titleWords.length - 1];

  // ── Token style ───────────────────────────────────────────────────────────
  const tokenStyle = (isDark ? TK_DARK : TK_LIGHT) as React.CSSProperties;

  // ── Button base styles ────────────────────────────────────────────────────
  const btnBase: React.CSSProperties = {
    height: 44, minWidth: 44, borderRadius: 8, border: "1px solid var(--pv-line)",
    cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700, fontSize: 14, letterSpacing: "0.04em",
    textTransform: "uppercase", padding: "0 14px",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
    whiteSpace: "nowrap", outline: "none",
    background: "transparent", color: "var(--pv-ink)",
    touchAction: "manipulation",
  };
  const btnPrimary: React.CSSProperties = {
    ...btnBase, flexGrow: 1,
    background: "var(--pv-accent)", color: "#fff", border: "none",
  };
  const focusRing = {
    onFocus: (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.outline = "2px solid var(--pv-accent)"),
    onBlur:  (e: React.FocusEvent<HTMLElement>) => (e.currentTarget.style.outline = "none"),
  };

  // ── Dribble wavy path for legend ──────────────────────────────────────────
  const dribblePts = Array.from({ length: 9 }, (_, i) => {
    const x = 2 + 28 * i / 8;
    const y = 6 + Math.sin(i * 2.2) * 2.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div
      ref={wrapRef}
      style={{
        ...tokenStyle,
        maxWidth: 1080, margin: "0 auto",
        fontFamily: "'Barlow', sans-serif",
        background: "var(--pv-bg)",
        borderRadius: 12, overflow: "hidden",
      } as React.CSSProperties}
    >
      {/* ── Header ── */}
      <div style={{ padding: isNarrow ? "16px 12px 14px" : "24px 24px 18px", borderBottom: "3px solid var(--pv-ink)" }}>
        {eyebrow && (
          <p style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 13,
            textTransform: "uppercase", letterSpacing: "0.12em",
            color: "var(--pv-muted)", margin: "0 0 6px",
          }}>
            {eyebrow}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800,
            fontSize: "clamp(34px,7vw,52px)", textTransform: "uppercase",
            lineHeight: 0.95, margin: 0, color: "var(--pv-ink)",
          }}>
            {titleMain && <>{titleMain} </>}
            <span style={{ color: "var(--pv-accent)" }}>{titleLast}</span>
          </h1>

          {/* Legend — hidden on narrow screens */}
          <div style={{ display: isNarrow ? "none" : "flex", gap: 14, alignItems: "flex-end", flexShrink: 0 }}>
            {([
              { label: "Corte", svg: (
                <svg viewBox="0 0 34 12" width={34} height={12}>
                  <defs><marker id={`lga-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>
                  <line x1="2" y1="6" x2="30" y2="6" stroke="currentColor" strokeWidth="1.8" markerEnd={`url(#lga-${uid})`}/>
                </svg>
              )},
              { label: "Passe", svg: (
                <svg viewBox="0 0 34 12" width={34} height={12}>
                  <defs><marker id={`lgb-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>
                  <line x1="2" y1="6" x2="30" y2="6" stroke="currentColor" strokeWidth="1.8" strokeDasharray="4 3" markerEnd={`url(#lgb-${uid})`}/>
                </svg>
              )},
              { label: "Drible", svg: (
                <svg viewBox="0 0 34 12" width={34} height={12}>
                  <defs><marker id={`lgc-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>
                  <polyline points={dribblePts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" markerEnd={`url(#lgc-${uid})`}/>
                </svg>
              )},
              { label: "Bloqueio", svg: (
                <svg viewBox="0 0 34 12" width={34} height={12}>
                  <line x1="2" y1="6" x2="28" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <line x1="28" y1="1" x2="28" y2="11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              )},
            ] as { label: string; svg: React.ReactNode }[]).map(({ label, svg }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: "var(--pv-muted)" }}>
                {svg}
                <span style={{ fontFamily: "'Barlow', sans-serif", fontSize: 10, color: "var(--pv-muted)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid var(--pv-line)", scrollbarWidth: "none" }}>
        {options.map((opt, i) => {
          const active = i === activeOption;
          return (
            <button key={opt.id} onClick={() => setActiveOption(i)} {...focusRing}
              style={{
                flexShrink: 0, padding: "12px 20px", background: "transparent", border: "none",
                cursor: "pointer", textAlign: "left", outline: "none",
                borderBottom: active ? "3px solid var(--pv-accent)" : "3px solid transparent",
                boxShadow: active ? "inset 0 -3px 0 var(--pv-accent)" : "none",
              }}
            >
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, textTransform: "uppercase", lineHeight: 1.1, color: active ? "var(--pv-ink)" : "var(--pv-muted)" }}>{opt.label}</div>
              <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 12.5, color: "var(--pv-muted)", marginTop: 2 }}>{opt.sub}</div>
            </button>
          );
        })}
      </div>

      {/* ── Main grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isNarrow ? "1fr" : "minmax(0,1.25fr) minmax(0,1fr)",
        gap: isNarrow ? 12 : 20,
        padding: isNarrow ? 12 : 20,
      }}>
        {/* LEFT: court + controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Court */}
          <div style={{ background: "var(--pv-panel)", border: "1px solid var(--pv-line)", borderRadius: 10, overflow: "hidden" }}>
            <svg viewBox="-12 -12 524 494" style={{ width: "100%", height: "auto", display: "block" }}>
              <defs>
                <marker id={`arr-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10Z" fill="var(--pv-trail)"/>
                </marker>
              </defs>
              <rect x="-12" y="-12" width="524" height="494" rx="6" fill="var(--pv-court)"/>
              <g stroke="var(--pv-court-line)" fill="none" strokeWidth="2.5">
                <rect x="170" y="0" width="160" height="190" fill="var(--pv-paint)"/>
                <rect x="0" y="0" width="500" height="470"/>
                <circle cx="250" cy="190" r="60"/>
                <path d="M30 0V99A225 225 0 0 0 470 99V0"/>
                <path d="M209 52A41 41 0 0 0 291 52"/>
                <path d="M190 470A60 60 0 0 1 310 470"/>
                <path d="M220 40H280" strokeWidth="4"/>
                <path d="M250 40V43"/>
                <circle cx="250" cy="52" r="9" stroke="var(--pv-ball)" fill="none"/>
                <path d="M163 70h7M163 100h7M163 130h7M163 160h7M330 70h7M330 100h7M330 130h7M330 160h7" strokeWidth="2"/>
              </g>
              <g ref={trailsRef}/>
              <g ref={playersRef}/>
              <circle ref={ballRef} r="7.5" fill="var(--pv-ball)" stroke="var(--pv-court-line)" strokeWidth="1.2" cx="250" cy="345"/>
            </svg>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Row 1: restart + prev/next + play */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button style={btnBase} onClick={handleRestart} title="Recomeçar" aria-label="Recomeçar" {...focusRing}>↺</button>
              <button style={{ ...btnBase, opacity: stepIdx === 0 ? 0.4 : 1 }} onClick={handlePrev} disabled={stepIdx === 0} aria-label="Passo anterior" {...focusRing}>‹</button>
              <button style={btnPrimary} onClick={handlePlay} {...focusRing}>
                {playing ? "⏸ Pausa" : "▶ Reproduzir"}
              </button>
              <button style={{ ...btnBase, opacity: stepIdx === stepSeq.length - 1 ? 0.4 : 1 }} onClick={handleNext} disabled={stepIdx === stepSeq.length - 1} aria-label="Passo seguinte" {...focusRing}>›</button>
            </div>
            {/* Row 2: step counter + speed toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12,
                color: "var(--pv-muted)", fontVariantNumeric: "tabular-nums",
              }}>
                Passo {stepIdx + 1} / {stepSeq.length}
              </span>
              <div style={{ display: "flex", border: "1px solid var(--pv-line)", borderRadius: 8, overflow: "hidden" }}>
                {([0.5, 1] as const).map(s => (
                  <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)} {...focusRing}
                    style={{
                      ...btnBase, borderRadius: 0, padding: "0 16px",
                      background: speed === s ? "var(--pv-accent)" : "transparent",
                      color: speed === s ? "#fff" : "var(--pv-ink)",
                      border: "none", fontSize: 13,
                    }}
                  >{s}×</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: step panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {curStep && (
            <>
              <p style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 11,
                textTransform: "uppercase", letterSpacing: "0.12em",
                color: "var(--pv-accent)", margin: 0, fontVariantNumeric: "tabular-nums",
              }}>
                PASSO {stepIdx + 1} / {stepSeq.length}
              </p>
              <h2 style={{
                fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26,
                textTransform: "uppercase", color: "var(--pv-ink)", margin: 0, lineHeight: 1.1,
              }}>
                {curStep.title}
              </h2>
              <p aria-live="polite" style={{ fontFamily: "'Barlow', sans-serif", fontSize: 14, color: "var(--pv-muted)", margin: 0, lineHeight: 1.55 }}>
                {curStep.text}
              </p>

              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                {stepSeq.map((s, i) => {
                  const isCur  = i === stepIdx;
                  const isDone = i < stepIdx;
                  return (
                    <li key={i}>
                      <button onClick={() => handleStepClick(i)} {...focusRing}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, width: "100%",
                          padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                          textAlign: "left", outline: "none",
                          background: isCur ? "color-mix(in srgb, var(--pv-accent) 12%, transparent)" : "transparent",
                        }}
                      >
                        <span style={{
                          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 18,
                          color: isCur ? "var(--pv-accent)" : isDone ? "var(--pv-ink)" : "var(--pv-muted)",
                          minWidth: 22, fontVariantNumeric: "tabular-nums",
                        }}>{i + 1}</span>
                        <span style={{
                          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16,
                          textTransform: "uppercase",
                          color: isCur || isDone ? "var(--pv-ink)" : "var(--pv-muted)",
                        }}>{s.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {note && (
                <p style={{
                  fontFamily: "'Barlow', sans-serif", fontSize: 12.5, color: "var(--pv-muted)",
                  margin: "auto 0 0", paddingTop: 10, borderTop: "1px solid var(--pv-line)",
                }}>
                  {note}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
