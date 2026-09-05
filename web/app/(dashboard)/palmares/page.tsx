"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Entry {
  id: string;
  epoca: string;
  competicao: "Liga" | "Taça";
  colocacao: 1 | 2 | 3;
  created_at: string;
}
interface Piece extends Entry { pieceNo: number }
interface Room  { label: string; items: Piece[] }

/* ─── Tier palette ───────────────────────────────────────────────────────── */
const TIER = {
  1: { label: "Campeão",       gradTop: "#f5dfa0", gradBot: "#b8862f", solid: "#c9a24b" },
  2: { label: "Vice-Campeão",  gradTop: "#eef0f0", gradBot: "#9a9a9a", solid: "#c7c2b4" },
  3: { label: "3.º Lugar",     gradTop: "#e6c19a", gradBot: "#93613a", solid: "#c98f5f" },
} as const;

/* ─── SVG trophies ──────────────────────────────────────────────────────── */
function TrophyLiga({ sz, col, uid }: { sz: number; col: 1|2|3; uid: string }) {
  const t  = TIER[col];
  const id = `gl-${uid}`;
  return (
    <svg viewBox="0 0 120 150" width={sz} height={Math.round(sz * 1.25)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={t.gradTop} />
          <stop offset="100%" stopColor={t.gradBot} />
        </linearGradient>
      </defs>
      <path d="M35 15 H85 C85 45 78 60 60 60 C42 60 35 45 35 15 Z"
            fill={`url(#${id})`} stroke={t.solid} strokeWidth="1.4"/>
      <path d="M35 22 C18 22 18 48 38 50"
            fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round"/>
      <path d="M85 22 C102 22 102 48 82 50"
            fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinecap="round"/>
      <rect x="55" y="60" width="10" height="26" fill={`url(#${id})`}/>
      <path d="M40 92 H80 L86 104 H34 Z"
            fill={`url(#${id})`} stroke={t.solid} strokeWidth="1.1"/>
      <rect x="30" y="104" width="60" height="8" rx="2" fill={t.solid} opacity="0.9"/>
    </svg>
  );
}

function TrophyTaca({ sz, col, uid }: { sz: number; col: 1|2|3; uid: string }) {
  const t  = TIER[col];
  const id = `gt-${uid}`;
  return (
    <svg viewBox="0 0 120 150" width={sz} height={Math.round(sz * 1.25)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={t.gradTop} />
          <stop offset="100%" stopColor={t.gradBot} />
        </linearGradient>
      </defs>
      <path d="M20 24 C20 24 18 60 60 60 C102 60 100 24 100 24 Z"
            fill={`url(#${id})`} stroke={t.solid} strokeWidth="1.4"/>
      <path d="M28 31 C28 31 36 37 60 37 C84 37 92 31 92 31"
            fill="none" stroke={t.solid} strokeWidth="1" opacity="0.5"/>
      <rect x="55" y="60" width="10" height="24" fill={`url(#${id})`}/>
      <path d="M36 84 H84 L90 96 H30 Z"
            fill={`url(#${id})`} stroke={t.solid} strokeWidth="1.1"/>
      <rect x="26" y="96" width="68" height="8" rx="2" fill={t.solid} opacity="0.9"/>
    </svg>
  );
}

function Cup({ competicao, col, sz, uid }: {
  competicao: "Liga"|"Taça"; col: 1|2|3; sz: number; uid: string;
}) {
  return competicao === "Liga"
    ? <TrophyLiga sz={sz} col={col} uid={uid} />
    : <TrophyTaca sz={sz} col={col} uid={uid} />;
}

/* ─── Grouping ──────────────────────────────────────────────────────────── */
function buildRooms(entries: Entry[]): Room[] {
  if (!entries.length) return [];

  const withYear = entries.map(e => ({ ...e, yr: parseInt(e.epoca) }));
  const years    = withYear.map(e => e.yr);
  const lo = Math.min(...years), hi = Math.max(...years);

  if (lo === hi) {
    return [{ label: `Sala ${lo}`, items: withYear.map((e, i) => ({ ...e, pieceNo: i + 1 })) }];
  }

  const mid    = Math.round((lo + hi) / 2);
  const recent = withYear.filter(e => e.yr >  mid);
  const older  = withYear.filter(e => e.yr <= mid);
  const rooms: Room[] = [];
  let no = 1;

  if (recent.length) {
    const ys = recent.map(e => e.yr);
    rooms.push({
      label: `Sala ${Math.min(...ys)}–${Math.max(...ys)}`,
      items: recent.map(e => ({ ...e, pieceNo: no++ })),
    });
  }
  if (older.length) {
    const ys = older.map(e => e.yr);
    rooms.push({
      label: `Sala ${Math.min(...ys)}–${Math.max(...ys)}`,
      items: older.map(e => ({ ...e, pieceNo: no++ })),
    });
  }
  return rooms;
}

/* ─── Trophy card (pedestal) ────────────────────────────────────────────── */
function TrophyCard({
  piece, isAdmin, onOpen, onDelete,
}: {
  piece: Piece;
  isAdmin: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const tier = TIER[piece.colocacao];
  return (
    <div className="group relative flex flex-col items-center w-full">
      {/* Delete button (admin only) */}
      {isAdmin && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="absolute top-1 right-1 z-20 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.55)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)" }}
          aria-label="Eliminar troféu"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col items-center w-full focus:outline-none"
        aria-label={`${tier.label} — ${piece.competicao} ${piece.epoca}`}
      >
        {/* Spotlight */}
        <div
          className="w-4/5 h-16 -mb-6 transition-all duration-300 rounded-full"
          style={{
            background: "radial-gradient(ellipse 80px 60px at 50% 20%, rgba(201,162,75,0.30) 0%, rgba(201,162,75,0.04) 60%, transparent 85%)",
          }}
        />

        {/* Trophy */}
        <div
          className="relative z-10 flex items-end justify-center h-32 transition-transform duration-300 group-hover:-translate-y-2"
          style={{ filter: `drop-shadow(0 8px 16px ${tier.solid}40)` }}
        >
          <Cup competicao={piece.competicao} col={piece.colocacao} sz={84} uid={piece.id} />
        </div>

        {/* Pedestal */}
        <div
          className="w-full rounded-b"
          style={{
            background: "linear-gradient(to bottom, rgba(201,162,75,0.12), rgba(201,162,75,0.03))",
            borderTop: `1px solid ${tier.solid}50`,
            paddingTop: 10,
          }}
        >
          <div
            className="mx-3 mb-3 px-3 py-2.5 text-center rounded-sm"
            style={{
              background: "linear-gradient(to bottom, #1c1a14, #131109)",
              border: "1px solid rgba(201,162,75,0.22)",
            }}
          >
            <p style={{ color: "#6f6a5f", fontFamily: "inherit", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 5 }}>
              Troféu Nº {String(piece.pieceNo).padStart(2, "0")}
            </p>
            <p className="palmares-serif" style={{ color: tier.solid, fontSize: 22, fontWeight: 600, lineHeight: 1.15 }}>
              {tier.label}
            </p>
            <p className="palmares-serif" style={{ color: "#a8a296", fontSize: 16, marginTop: 3 }}>
              {piece.competicao}
            </p>
            <p className="palmares-serif" style={{ color: "#c9b87a", fontSize: 15, marginTop: 4, fontStyle: "italic" }}>
              Época {piece.epoca}
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}

/* ─── Trophy modal (vitrine) ────────────────────────────────────────────── */
function TrophyModal({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const tier = TIER[piece.colocacao];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)" }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center w-full max-w-xs rounded-lg p-8 pb-7"
        style={{
          background: "linear-gradient(to bottom, #181610, #0d0b08)",
          border: "1px solid rgba(201,162,75,0.28)",
          boxShadow: "0 0 80px rgba(201,162,75,0.12), 0 32px 64px rgba(0,0,0,0.6)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors"
          style={{ color: "#6f6a5f" }}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className="absolute top-0 left-0 right-0 rounded-t-lg pointer-events-none"
          style={{
            height: 100,
            background: `radial-gradient(ellipse 160px 90px at 50% 0%, ${tier.solid}50, transparent 70%)`,
          }}
        />

        <div
          className="relative z-10 mt-6"
          style={{ filter: `drop-shadow(0 12px 24px ${tier.solid}50)` }}
        >
          <Cup competicao={piece.competicao} col={piece.colocacao} sz={150} uid={`modal-${piece.id}`} />
        </div>

        <div
          className="w-full mt-6 mb-5"
          style={{ height: 1, background: `linear-gradient(to right, transparent, ${tier.solid}80, transparent)` }}
        />

        <p style={{ color: "#6f6a5f", fontFamily: "inherit", fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 8 }}>
          Troféu Nº {String(piece.pieceNo).padStart(2, "0")}
        </p>
        <p className="palmares-serif" style={{ color: tier.solid, fontSize: 32, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>
          {tier.label}
        </p>
        <p className="palmares-serif" style={{ color: "#f5f1e8", fontSize: 22, marginTop: 4, textAlign: "center" }}>
          {piece.competicao}
        </p>
        <p className="palmares-serif" style={{ color: "#a8a296", fontSize: 16, marginTop: 3, fontStyle: "italic", textAlign: "center" }}>
          Época {piece.epoca}
        </p>
        <p className="palmares-serif" style={{ color: "#6f6a5f", fontSize: 12, marginTop: 4, textAlign: "center" }}>
          Liga Amadora INATEL Porto
        </p>

        <button
          onClick={onClose}
          className="mt-7 px-8 py-2 rounded transition-all hover:bg-white/8"
          style={{
            border: "1px solid rgba(201,162,75,0.38)",
            color: "#c9a24b",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 12,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

/* ─── Add trophy modal ──────────────────────────────────────────────────── */
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: (e: Entry) => void }) {
  const [epoca,      setEpoca]      = useState("");
  const [competicao, setCompeticao] = useState<"Liga"|"Taça">("Liga");
  const [colocacao,  setColocacao]  = useState<1|2|3>(1);
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!epoca.trim()) { setErr("Indica a época (ex: 2023/24)"); return; }
    setSaving(true);
    try {
      const res  = await fetch("/api/palmares", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ epoca: epoca.trim(), competicao, colocacao }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Erro ao guardar"); return; }
      onSaved(json.entry);
    } catch {
      setErr("Erro de rede");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "#0d0b08",
    border: "1px solid rgba(201,162,75,0.28)",
    borderRadius: 4,
    color: "#f5f1e8",
    padding: "8px 12px",
    fontSize: 14,
    width: "100%",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    color: "#6f6a5f",
    fontSize: 9,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-lg p-8"
        style={{
          background: "linear-gradient(to bottom, #181610, #0d0b08)",
          border: "1px solid rgba(201,162,75,0.28)",
          boxShadow: "0 0 60px rgba(201,162,75,0.10), 0 24px 48px rgba(0,0,0,0.6)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors"
          style={{ color: "#6f6a5f" }}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="palmares-serif" style={{ color: "#c9a24b", fontSize: 22, fontWeight: 600, marginBottom: 24 }}>
          Adicionar Troféu
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Época</label>
          <input
            style={inputStyle}
            placeholder="ex: 2023/24"
            value={epoca}
            onChange={e => setEpoca(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Competição</label>
          <select
            style={inputStyle}
            value={competicao}
            onChange={e => setCompeticao(e.target.value as "Liga"|"Taça")}
          >
            <option value="Liga">Liga</option>
            <option value="Taça">Taça</option>
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Colocação</label>
          <select
            style={inputStyle}
            value={colocacao}
            onChange={e => setColocacao(Number(e.target.value) as 1|2|3)}
          >
            <option value={1}>1.º lugar — Campeão</option>
            <option value={2}>2.º lugar — Vice-Campeão</option>
            <option value={3}>3.º lugar</option>
          </select>
        </div>

        {err && (
          <p style={{ color: "#f87171", fontSize: 13, marginBottom: 14 }}>{err}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 rounded transition-all"
          style={{
            background: saving ? "rgba(201,162,75,0.15)" : "rgba(201,162,75,0.18)",
            border: "1px solid rgba(201,162,75,0.45)",
            color: "#c9a24b",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 14,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "A guardar…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}

/* ─── Delete confirmation modal ─────────────────────────────────────────── */
function ConfirmDelete({ piece, onClose, onDeleted }: {
  piece: Piece;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [err,      setErr]      = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function doDelete() {
    setDeleting(true);
    setErr("");
    try {
      const res = await fetch(`/api/palmares/${piece.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setErr(j.error ?? "Erro"); return; }
      onDeleted(piece.id);
    } catch {
      setErr("Erro de rede");
    } finally {
      setDeleting(false);
    }
  }

  const tier = TIER[piece.colocacao];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-lg p-8 text-center"
        style={{
          background: "linear-gradient(to bottom, #181610, #0d0b08)",
          border: "1px solid rgba(239,68,68,0.28)",
          boxShadow: "0 0 60px rgba(239,68,68,0.08), 0 24px 48px rgba(0,0,0,0.6)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors"
          style={{ color: "#6f6a5f" }}
        >
          <X className="h-4 w-4" />
        </button>

        <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
          <Cup competicao={piece.competicao} col={piece.colocacao} sz={64} uid={`del-${piece.id}`} />
        </div>
        <p className="palmares-serif" style={{ color: "#f5f1e8", fontSize: 20, fontWeight: 600, marginBottom: 6 }}>
          Eliminar troféu?
        </p>
        <p className="palmares-serif" style={{ color: tier.solid, fontSize: 15, marginBottom: 4 }}>
          {tier.label} · {piece.competicao}
        </p>
        <p className="palmares-serif" style={{ color: "#a8a296", fontSize: 13, fontStyle: "italic", marginBottom: 24 }}>
          Época {piece.epoca}
        </p>

        {err && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded transition-all"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#a8a296",
              fontSize: 13,
              letterSpacing: "0.1em",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={doDelete}
            disabled={deleting}
            className="flex-1 py-2 rounded transition-all"
            style={{
              background: deleting ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#f87171",
              fontSize: 13,
              letterSpacing: "0.1em",
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "A eliminar…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function PalmaresPage() {
  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [activeRoom, setActiveRoom] = useState(0);
  const [selected,   setSelected]   = useState<Piece | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [toDelete,   setToDelete]   = useState<Piece | null>(null);

  /* Check admin role */
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await sb
        .from("users")
        .select("role")
        .eq("email", user.email!)
        .single();
      setIsAdmin(profile?.role === "admin");
    });
  }, []);

  /* Load entries */
  useEffect(() => {
    fetch("/api/palmares")
      .then(r => r.json())
      .then(({ palmares }) => setEntries(palmares ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rooms     = buildRooms(entries);
  const roomIdx   = Math.min(activeRoom, Math.max(rooms.length - 1, 0));
  const current   = rooms[roomIdx] ?? { label: "", items: [] };
  const titulos   = entries.filter(e => e.colocacao === 1).length;
  const podios    = entries.length;
  const lastTitle = entries.find(e => e.colocacao === 1);

  const closeModal = useCallback(() => setSelected(null), []);

  function handleSaved(entry: Entry) {
    setEntries(prev => [entry, ...prev].sort((a, b) => b.epoca.localeCompare(a.epoca)));
    setShowAdd(false);
  }

  function handleDeleted(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    setToDelete(null);
    if (selected?.id === id) setSelected(null);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');
        .palmares-serif { font-family: 'Cormorant Garamond', Georgia, serif; }
        .palmares-root  { background: #0b0d0a; background-image: radial-gradient(ellipse 1100px 500px at 50% 0%, rgba(230,200,120,0.09), transparent 65%); }
        .palmares-door  {
          border-radius: 60px 60px 6px 6px;
          border: 1.5px solid rgba(201,162,75,0.18);
          background: rgba(201,162,75,0.03);
          color: #a8a296;
          padding: 16px 28px 14px;
          cursor: pointer;
          transition: border-color .2s, color .2s, background .2s;
          min-width: 140px;
          text-align: center;
        }
        .palmares-door:hover  { border-color: rgba(201,162,75,0.38); color: #f5f1e8; background: rgba(201,162,75,0.05); }
        .palmares-door.active { border-color: #c9a24b; background: rgba(201,162,75,0.09); color: #c9a24b; }
      `}</style>

      <div className="palmares-root -mx-4 md:-mx-6 -mt-6 px-4 md:px-6 pb-20 pt-10 min-h-screen">

        {/* ── Header ── */}
        <div className="text-center mb-10">
          <div style={{ height: 1, background: "linear-gradient(to right, transparent, #c9a24b80, transparent)", maxWidth: 160, margin: "0 auto 18px" }} />
          <p
            className="palmares-serif"
            style={{ color: "#c9a24b", fontSize: 11, letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: 6 }}
          >
            CD Póvoa Masters · Liga Amadora INATEL Porto
          </p>
          <h1
            className="palmares-serif"
            style={{ color: "#f5f1e8", fontSize: "clamp(2.6rem, 7vw, 4rem)", fontWeight: 600, lineHeight: 1 }}
          >
            Palmarés
          </h1>
          <p
            className="palmares-serif"
            style={{ color: "#a8a296", fontSize: 18, marginTop: 6, fontStyle: "italic" }}
          >
            Sala de troféus — uma história de conquistas
          </p>
          <div style={{ height: 1, background: "linear-gradient(to right, transparent, #c9a24b80, transparent)", maxWidth: 160, margin: "18px auto 0" }} />
        </div>

        {/* ── Stats bar ── */}
        {!loading && podios > 0 && (
          <div className="flex justify-center flex-wrap gap-8 md:gap-16 mb-10">
            {[
              { val: titulos,                 sub: "Títulos"          },
              { val: podios,                  sub: "Pódios"           },
              { val: lastTitle?.epoca ?? "—", sub: "Última conquista" },
            ].map(s => (
              <div key={s.sub} className="text-center">
                <p className="palmares-serif" style={{ color: "#c9a24b", fontSize: 34, fontWeight: 600, lineHeight: 1 }}>
                  {s.val}
                </p>
                <p style={{ color: "#6f6a5f", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 4 }}>
                  {s.sub}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Admin: add button ── */}
        {isAdmin && (
          <div className="flex justify-center mb-8">
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-5 py-2 rounded transition-all hover:bg-white/8"
              style={{
                border: "1px solid rgba(201,162,75,0.38)",
                color: "#c9a24b",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 13,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar troféu
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <p className="palmares-serif text-center py-24" style={{ color: "#6f6a5f", fontSize: 20 }}>
            A carregar…
          </p>
        )}

        {/* ── Empty state ── */}
        {!loading && !entries.length && (
          <div className="text-center py-28">
            <p className="palmares-serif" style={{ color: "#6f6a5f", fontSize: 24 }}>
              Nenhum título registado ainda.
            </p>
            {isAdmin && (
              <p style={{ color: "#6f6a5f", fontSize: 13, marginTop: 8 }}>
                Clica em "Adicionar troféu" para registar o primeiro.
              </p>
            )}
          </div>
        )}

        {/* ── Rooms + grid ── */}
        {!loading && !!entries.length && (
          <>
            {rooms.length > 1 && (
              <div className="flex justify-center gap-4 mb-12" style={{ overflowX: "auto", padding: "0 4px 4px" }}>
                {rooms.map((room, i) => (
                  <button
                    key={i}
                    className={`palmares-door${i === roomIdx ? " active" : ""}`}
                    onClick={() => setActiveRoom(i)}
                    type="button"
                  >
                    <p className="palmares-serif" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
                      {room.label}
                    </p>
                    <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 5, opacity: 0.7 }}>
                      {room.items.length} {room.items.length === 1 ? "peça" : "peças"}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div
              className="grid gap-5 max-w-3xl mx-auto"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" }}
            >
              {current.items.map(piece => (
                <TrophyCard
                  key={piece.id}
                  piece={piece}
                  isAdmin={isAdmin}
                  onOpen={() => setSelected(piece)}
                  onDelete={() => setToDelete(piece)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {selected && <TrophyModal   piece={selected} onClose={closeModal} />}
      {showAdd  && <AddModal      onClose={() => setShowAdd(false)} onSaved={handleSaved} />}
      {toDelete && (
        <ConfirmDelete
          piece={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
