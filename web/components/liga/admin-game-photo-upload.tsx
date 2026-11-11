"use client";

import { useRef, useState } from "react";
import { prepareGamePhoto } from "@/lib/liga/game-photo-client";

interface Props {
  eventId: string;
  teams: { id: string; name: string }[];
  onUploaded: () => void | Promise<void>;
}

// Admin: adicionar fotos a um jogo a qualquer momento (antes ou depois do resultado).
export function AdminGamePhotoUpload({ eventId, teams, onUploaded }: Props) {
  const [teamId, setTeamId] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setError(null);
    for (let i = 0; i < files.length; i++) {
      setBusy(`A carregar ${i + 1}/${files.length}…`);
      try {
        const file = await prepareGamePhoto(files[i]);
        const fd = new FormData();
        fd.append("photo", file);
        if (teamId) fd.append("team_id", teamId);
        if (caption.trim()) fd.append("caption", caption.trim());
        const res = await fetch(`/api/liga/admin/games/${eventId}/photos`, { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setError(json.error ?? "Erro no upload."); break; }
      } catch (err) {
        setError(`Erro ao processar foto: ${String(err)}`);
        break;
      }
    }
    setBusy(null);
    setCaption("");
    await onUploaded();
  }

  const field: React.CSSProperties = { fontSize: "12px", padding: "5px 8px", borderRadius: "5px", border: "1px solid #E8E0D6", background: "hsl(var(--card))", color: "#1A1612" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "10px" }}>
      <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!!busy} style={field} aria-label="Crédito da foto">
        <option value="">Foto: Liga INATEL</option>
        {teams.map((t) => <option key={t.id} value={t.id}>Foto: {t.name}</option>)}
      </select>
      <input
        type="text"
        placeholder="Legenda (opcional)"
        maxLength={120}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={!!busy}
        style={{ ...field, flex: "1 1 160px", minWidth: 0 }}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        style={{ display: "none" }}
        onChange={handleFiles}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={!!busy}
        style={{ ...field, background: busy ? "#FDBA74" : "#F97316", color: "#fff", border: "none", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}
      >
        {busy ?? "+ Adicionar fotos"}
      </button>
      {error && <p style={{ width: "100%", fontSize: "11px", color: "#DC2626", margin: 0 }}>{error}</p>}
    </div>
  );
}
