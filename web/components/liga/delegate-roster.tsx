"use client";

/**
 * Área de equipa — plantel atual: fotografia, número, primeiro e último nome.
 * O plantel é público na página da equipa e ajuda a validar a leitura das folhas de jogo.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Player = { id: string; firstName: string; lastName: string; number: number | null; photoUrl: string | null };
type Draft = { id?: string; first_name: string; last_name: string; number: string; photo: File | null; preview: string | null; removePhoto: boolean };

const EMPTY: Draft = { first_name: "", last_name: "", number: "", photo: null, preview: null, removePhoto: false };

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: "15px", borderRadius: "8px",
  border: "1.5px solid var(--border,#E8E0D4)", background: "var(--card,#fff)", color: "var(--fg,#15110E)",
};
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "10px 14px", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
  border: primary ? "none" : "1.5px solid var(--border,#E8E0D4)", background: primary ? (disabled ? "#FDBA74" : "#F97316") : "var(--card,#fff)",
  color: primary ? "#fff" : "var(--fg,#15110E)",
});

/** Reduz a fotografia no browser (≤ 1200 px, JPEG) antes do envio — mais rápido em dados móveis. */
async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function Avatar({ p, size = 56 }: { p: { photoUrl: string | null; firstName: string; lastName: string }; size?: number }) {
  if (p.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.photoUrl} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#EEE" }} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: "#FFEDD5", color: "#C2410C", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.34, flexShrink: 0 }}>
      {(p.firstName[0] ?? "") + (p.lastName[0] ?? "")}
    </span>
  );
}

export function DelegateRoster() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/liga/equipa/plantel");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro ao carregar o plantel." }); return; }
    setPlayers(json.players as Player[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f || !draft) return;
    const small = await shrinkPhoto(f);
    setDraft({ ...draft, photo: small, preview: URL.createObjectURL(small), removePhoto: false });
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append("first_name", draft.first_name);
    fd.append("last_name", draft.last_name);
    fd.append("number", draft.number);
    if (draft.photo) fd.append("photo", draft.photo);
    if (draft.removePhoto) fd.append("remove_photo", "1");
    const res = await fetch(draft.id ? `/api/liga/equipa/plantel/${draft.id}` : "/api/liga/equipa/plantel", { method: draft.id ? "PATCH" : "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro ao guardar." }); return; }
    setMsg({ ok: true, text: draft.id ? "Jogador atualizado." : "Jogador adicionado ao plantel." });
    setDraft(null);
    await load();
  }

  async function remove(p: Player) {
    if (!confirm(`Retirar ${p.firstName} ${p.lastName} do plantel atual? Deixa de aparecer na página pública da equipa.`)) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/liga/equipa/plantel/${p.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: json.error ?? "Erro ao remover." }); return; }
    await load();
  }

  const taken = new Set((players ?? []).filter((p) => p.id !== draft?.id).map((p) => p.number));
  const numberClash = draft && draft.number !== "" && taken.has(Number(draft.number));

  return (
    <div>
      {msg && <p style={{ fontSize: "13px", margin: "0 0 10px", padding: "8px 10px", borderRadius: "8px", background: msg.ok ? "#F0FDF4" : "#FEF2F2", color: msg.ok ? "#15803D" : "#B91C1C" }}>{msg.text}</p>}

      {players === null ? <p style={{ fontSize: "13px", color: "var(--muted,#6F675F)" }}>A carregar…</p> : (
        <>
          {players.length === 0 && !draft && (
            <p style={{ fontSize: "13px", color: "var(--muted,#6F675F)", margin: "0 0 10px" }}>
              Ainda não há jogadores no plantel. Adicione-os para aparecerem na página pública da equipa e para validar a leitura das folhas de jogo.
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px", marginBottom: "12px" }}>
            {players.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--border,#E8E0D4)", background: "var(--card,#fff)" }}>
                <Avatar p={p} size={48} />
                <span style={{ fontFamily: "var(--font-bc-heavy, var(--font-barlow-condensed, sans-serif))", fontWeight: 800, fontSize: "22px", color: "#F97316", minWidth: "34px", textAlign: "center" }}>{p.number ?? "–"}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.firstName} {p.lastName}</span>
                <button onClick={() => setDraft({ id: p.id, first_name: p.firstName, last_name: p.lastName, number: p.number === null ? "" : String(p.number), photo: null, preview: p.photoUrl, removePhoto: false })} disabled={busy} style={{ background: "none", border: "none", color: "#F97316", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>Editar</button>
              </div>
            ))}
          </div>

          {draft ? (
            <div style={{ border: "1.5px solid #F97316", borderRadius: "12px", padding: "14px", background: "var(--card,#fff)" }}>
              <p style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px" }}>{draft.id ? "Editar jogador" : "Novo jogador"}</p>
              <div style={{ display: "flex", gap: "14px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
                <button onClick={() => fileRef.current?.click()} style={{ all: "unset", cursor: "pointer" }} aria-label="Escolher fotografia">
                  {draft.preview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={draft.preview} alt="" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover" }} />
                    : <span style={{ width: 84, height: 84, borderRadius: "50%", border: "2px dashed #FDBA74", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#C2410C", textAlign: "center" }}>＋ Foto</span>}
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <button onClick={() => fileRef.current?.click()} style={{ ...btn(), padding: "7px 10px", fontSize: "13px" }}>{draft.preview ? "Trocar fotografia" : "Adicionar fotografia"}</button>
                  {draft.preview && <button onClick={() => setDraft({ ...draft, photo: null, preview: null, removePhoto: Boolean(draft.id) })} style={{ background: "none", border: "none", color: "#B91C1C", fontSize: "12px", cursor: "pointer", textAlign: "left" }}>Remover fotografia</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pickPhoto} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "8px", marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", color: "var(--muted,#6F675F)" }}>Número
                  <input inputMode="numeric" maxLength={2} value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value.replace(/\D/g, "").slice(0, 2) })} style={{ ...input, marginTop: 4, borderColor: numberClash ? "#F87171" : undefined }} placeholder="7" />
                </label>
                <label style={{ fontSize: "12px", color: "var(--muted,#6F675F)" }}>Primeiro nome
                  <input value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} style={{ ...input, marginTop: 4 }} placeholder="Afonso" autoComplete="off" />
                </label>
              </div>
              <label style={{ fontSize: "12px", color: "var(--muted,#6F675F)", display: "block", marginBottom: "10px" }}>Último nome
                <input value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} style={{ ...input, marginTop: 4 }} placeholder="Silva" autoComplete="off" />
              </label>
              {numberClash && <p style={{ fontSize: "12px", color: "#B91C1C", margin: "0 0 8px" }}>Já existe um jogador com o número {draft.number}.</p>}
              <p style={{ fontSize: "11px", color: "var(--muted,#6F675F)", margin: "0 0 10px" }}>
                O nome, o número e a fotografia ficam visíveis na página pública da equipa. Confirme que o jogador autoriza a publicação.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={save} disabled={busy || !draft.first_name.trim() || !draft.last_name.trim() || draft.number === "" || Boolean(numberClash)} style={{ ...btn(true, busy), flex: 1 }}>{busy ? "A guardar…" : "Guardar"}</button>
                {draft.id && <button onClick={() => { const p = players.find((x) => x.id === draft.id); if (p) void remove(p); setDraft(null); }} disabled={busy} style={{ ...btn(), color: "#B91C1C" }}>Retirar do plantel</button>}
                <button onClick={() => setDraft(null)} disabled={busy} style={btn()}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setMsg(null); setDraft({ ...EMPTY }); }} style={{ ...btn(true), width: "100%" }}>＋ Adicionar jogador</button>
          )}
        </>
      )}
    </div>
  );
}
