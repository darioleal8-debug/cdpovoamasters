"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KitEditorData {
  primary_color: string | null;
  secondary_color: string | null;
  kit_description?: string | null;
}

interface Props {
  initialPrimaryColor?: string | null;
  initialSecondaryColor?: string | null;
  initialDescription?: string | null;
  teamName: string;
  logoUrl?: string | null;
  showDescription?: boolean;
  onSave: (data: KitEditorData) => Promise<{ error?: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 999;
  return Math.sqrt((ra[0] - rb[0]) ** 2 + (ra[1] - rb[1]) ** 2 + (ra[2] - rb[2]) ** 2);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TeamKitEditor({
  initialPrimaryColor,
  initialSecondaryColor,
  initialDescription,
  teamName,
  logoUrl,
  showDescription = false,
  onSave,
}: Props) {
  const initPrimary   = initialPrimaryColor   ?? "";
  const initSecondary = initialSecondaryColor ?? "";
  const initDesc      = initialDescription    ?? "";

  const [primary,   setPrimary]   = useState(initPrimary);
  const [secondary, setSecondary] = useState(initSecondary);
  const [desc,      setDesc]      = useState(initDesc);
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState<{ text: string; ok: boolean } | null>(null);

  const primaryValid   = HEX_RE.test(primary);
  const secondaryValid = HEX_RE.test(secondary);
  const isValid        = primaryValid && secondaryValid;
  const lowContrast    = isValid && colorDistance(primary, secondary) < 50;
  const isDirty        = primary !== initPrimary || secondary !== initSecondary ||
                         (showDescription && desc !== initDesc);

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    setMsg(null);
    const result = await onSave({
      primary_color: primary,
      secondary_color: secondary,
      ...(showDescription ? { kit_description: desc.trim() || null } : {}),
    });
    setSaving(false);
    if (result.error) {
      setMsg({ text: result.error, ok: false });
    } else {
      setMsg({ text: "✓ Cores guardadas.", ok: true });
    }
  }

  // Picker falls back to a neutral colour when input isn't yet valid hex
  const pickerPrimary   = primaryValid   ? primary   : "#F97316";
  const pickerSecondary = secondaryValid ? secondary : "#FFFFFF";

  return (
    <div style={{
      padding: "16px", borderRadius: "10px",
      border: "1px solid var(--border, #E8E0D4)",
      background: "var(--card, #fff)",
    }}>
      {/* ── Preview ── */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
        {/* Primary swatch with logo */}
        <div style={{
          width: "52px", height: "52px", borderRadius: "9px", flexShrink: 0,
          background: primaryValid ? primary : "#E8E0D4",
          border: "1.5px solid rgba(0,0,0,.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: "38px", height: "38px", objectFit: "contain" }} />
          )}
          {!logoUrl && (
            <span style={{ fontWeight: 900, fontSize: "15px", color: primaryValid ? "rgba(255,255,255,0.9)" : "#8C837A" }}>
              {teamName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        {/* Secondary swatch */}
        <div style={{
          width: "28px", height: "52px", borderRadius: "7px", flexShrink: 0,
          background: secondaryValid ? secondary : "#E8E0D4",
          border: "1.5px solid rgba(0,0,0,.08)",
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg, #15110E)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {teamName}
          </p>
          <p style={{ fontSize: "11px", color: "var(--muted, #6F675F)", margin: 0 }}>
            {primaryValid && secondaryValid
              ? `${primary} · ${secondary}`
              : "Pré-visualização do equipamento"}
          </p>
        </div>
      </div>

      {/* ── Inputs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* Primary */}
        <div>
          <label style={labelStyle}>Cor primária *</label>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="color"
              value={pickerPrimary}
              onChange={e => { setPrimary(e.target.value); setMsg(null); }}
              style={colorPickerStyle}
            />
            <input
              type="text"
              value={primary}
              onChange={e => { setPrimary(e.target.value); setMsg(null); }}
              placeholder="#E63946"
              maxLength={7}
              style={{
                ...textInputStyle,
                borderColor: primary && !primaryValid ? "#EF4444" : undefined,
              }}
            />
          </div>
          {primary && !primaryValid && <p style={errorHint}>Formato inválido (ex: #E63946)</p>}
        </div>

        {/* Secondary */}
        <div>
          <label style={labelStyle}>Cor secundária *</label>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="color"
              value={pickerSecondary}
              onChange={e => { setSecondary(e.target.value); setMsg(null); }}
              style={colorPickerStyle}
            />
            <input
              type="text"
              value={secondary}
              onChange={e => { setSecondary(e.target.value); setMsg(null); }}
              placeholder="#FFFFFF"
              maxLength={7}
              style={{
                ...textInputStyle,
                borderColor: secondary && !secondaryValid ? "#EF4444" : undefined,
              }}
            />
          </div>
          {secondary && !secondaryValid && <p style={errorHint}>Formato inválido (ex: #FFFFFF)</p>}
        </div>

        {/* Description (admin only) */}
        {showDescription && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Descrição do equipamento</label>
            <input
              type="text"
              value={desc}
              onChange={e => { setDesc(e.target.value); setMsg(null); }}
              placeholder="Ex: Camisola vermelha com faixa branca e número a preto"
              maxLength={300}
              style={{ ...textInputStyle, width: "100%", boxSizing: "border-box" as const }}
            />
          </div>
        )}
      </div>

      {/* Low contrast warning */}
      {lowContrast && (
        <p style={{
          fontSize: "11px", color: "#92400E", margin: "10px 0 0",
          padding: "6px 10px", background: "#FEF3C7", borderRadius: "6px",
        }}>
          ⚠️ As duas cores são muito semelhantes — podem ser difíceis de distinguir no equipamento.
        </p>
      )}

      {/* Message */}
      {msg && (
        <p style={{ fontSize: "12px", margin: "8px 0 0", color: msg.ok ? "#16A34A" : "#DC2626" }}>
          {msg.text}
        </p>
      )}

      {/* Save button */}
      <div style={{ marginTop: "12px" }}>
        <button
          onClick={handleSave}
          disabled={saving || !isValid || !isDirty}
          style={{
            padding: "6px 16px", fontSize: "12px", fontWeight: 700,
            border: "1.5px solid #F97316", borderRadius: "7px",
            background: "transparent",
            color: (saving || !isValid || !isDirty) ? "#D1C9C0" : "#F97316",
            cursor: (saving || !isValid || !isDirty) ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "A guardar…" : "Guardar cores"}
        </button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 600,
  color: "var(--muted, #6F675F)", marginBottom: "4px",
};

const textInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "7px 10px", fontSize: "12px",
  fontFamily: "var(--font-ibm-mono, monospace)",
  border: "1.5px solid var(--border, #E8E0D4)", borderRadius: "6px",
  background: "var(--bg, #F6F2EC)", color: "var(--fg, #15110E)", outline: "none",
};

const colorPickerStyle: React.CSSProperties = {
  width: "34px", height: "34px", padding: "2px",
  border: "1.5px solid var(--border, #E8E0D4)", borderRadius: "6px",
  cursor: "pointer", flexShrink: 0,
};

const errorHint: React.CSSProperties = {
  fontSize: "10px", color: "#EF4444", margin: "3px 0 0",
};
