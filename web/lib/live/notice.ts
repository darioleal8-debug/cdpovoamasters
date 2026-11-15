// Tiny pub/sub for soft, non-interactive confirmations in the live screens.
// Unlike Radix toasts (portalled to <body>, invisible in element full screen),
// these are rendered by <LiveNotices/> inside the live container.

export type LiveNoticeKind = "ok" | "info" | "error";
export interface LiveNoticeItem { id: number; text: string; kind: LiveNoticeKind }

type Listener = (n: LiveNoticeItem) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function liveNotice(text: string, kind: LiveNoticeKind = "ok") {
  const item = { id: ++seq, text, kind };
  listeners.forEach((l) => l(item));
  // Short haptic tick where supported (not iOS Safari) — a "registered" feel without looking
  try { navigator.vibrate?.(kind === "error" ? [30, 40, 30] : 12); } catch { /* ignore */ }
}

export function subscribeLiveNotice(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export const PLAY_LABEL: Record<string, string> = {
  "2pt_made": "2PT made", "2pt_miss": "2PT missed",
  "3pt_made": "3PT made", "3pt_miss": "3PT missed",
  "ft_made": "Free throw made", "ft_miss": "Free throw missed",
  rebound_off: "Offensive rebound", rebound_def: "Defensive rebound",
  assist: "Assist", steal: "Steal", block: "Block", turnover: "Turnover",
  foul_committed: "Foul", foul_drawn: "Foul drawn", foul_def: "Defensive foul",
  foul_of: "Offensive foul", foul_tec: "Technical foul", foul_anti: "Unsportsmanlike foul",
  timeout: "Timeout",
};
