"use client";

import { useState, useRef } from "react";

interface Props {
  teamId: string;
  teamName: string;
  currentLogoUrl: string | null;
}

export function TeamLogoUpload({ teamId: _teamId, teamName, currentLogoUrl }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(currentLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("logo", file);

      const res = await fetch("/api/liga/equipa/logo", {
        method: "PATCH",
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Erro ao carregar logo.");
        return;
      }

      setLogoUrl(json.logo_url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const initials = teamName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "16px",
        borderRadius: "10px",
        border: "1px solid var(--border, #E8E0D4)",
        background: "var(--card, #fff)",
      }}
    >
      {/* Current logo or initials */}
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "10px",
          background: logoUrl ? "transparent" : "#F97316",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
          border: "1px solid var(--border, #E8E0D4)",
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={teamName}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontWeight: 900, fontSize: "16px", color: "#fff", fontFamily: "var(--font-bc-heavy, sans-serif)" }}>
            {initials}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg, #15110E)", margin: "0 0 2px" }}>
          Logótipo da equipa
        </p>
        <p style={{ fontSize: "11px", color: "var(--muted, #6F675F)", margin: "0 0 8px" }}>
          JPEG, PNG, WebP ou SVG · máx. 2 MB
        </p>

        {error && (
          <p style={{ fontSize: "12px", color: "#DC2626", margin: "0 0 6px" }}>{error}</p>
        )}
        {success && (
          <p style={{ fontSize: "12px", color: "#16A34A", margin: "0 0 6px" }}>✓ Logo actualizado.</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "6px 14px",
            fontSize: "12px",
            fontWeight: 600,
            border: "1.5px solid var(--border, #E8E0D4)",
            borderRadius: "7px",
            background: uploading ? "#F0EAE1" : "var(--bg, #F6F2EC)",
            color: uploading ? "var(--muted, #6F675F)" : "var(--fg, #15110E)",
            cursor: uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "A carregar…" : logoUrl ? "Alterar logo" : "Carregar logo"}
        </button>
      </div>
    </div>
  );
}
