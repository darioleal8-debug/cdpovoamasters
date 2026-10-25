"use client";

import { useState } from "react";

export interface GalleryPhoto {
  id: string;
  public_url: string;
  caption: string | null;
  team_name: string;
}

interface Props {
  photos: GalleryPhoto[];
}

export function GamePhotoGallery({ photos }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(photos.length, 3)}, 1fr)`,
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setLightbox(i)}
            style={{
              all: "unset",
              cursor: "zoom-in",
              display: "block",
              position: "relative",
              aspectRatio: "4/3",
              borderRadius: "8px",
              overflow: "hidden",
              background: "#1A1612",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.public_url}
              alt={photo.caption ?? `Foto ${i + 1} — ${photo.team_name}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* Captions row */}
      {photos.some((p) => p.caption) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(photos.length, 3)}, 1fr)`,
            gap: "8px",
            marginBottom: "4px",
          }}
        >
          {photos.map((photo) => (
            <p
              key={photo.id + "-cap"}
              style={{
                fontFamily: "var(--font-barlow, sans-serif)",
                fontSize: "11px",
                color: "#6F675F",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {photo.caption && <span>{photo.caption}<br /></span>}
              <span style={{ fontStyle: "italic" }}>Foto: {photo.team_name}</span>
            </p>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          role="dialog"
          aria-modal
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.92)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "20px",
            cursor: "zoom-out",
          }}
        >
          <button
            onClick={() => setLightbox(null)}
            aria-label="Fechar"
            style={{
              position: "absolute", top: "16px", right: "16px",
              background: "rgba(255,255,255,0.15)", border: "none",
              color: "#fff", fontSize: "22px", width: "40px", height: "40px",
              borderRadius: "50%", cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>

          {/* Prev / Next */}
          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + photos.length) % photos.length); }}
                aria-label="Anterior"
                style={{
                  position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
                  fontSize: "22px", width: "44px", height: "44px", borderRadius: "50%",
                  cursor: "pointer",
                }}
              >‹</button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % photos.length); }}
                aria-label="Seguinte"
                style={{
                  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
                  fontSize: "22px", width: "44px", height: "44px", borderRadius: "50%",
                  cursor: "pointer",
                }}
              >›</button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightbox].public_url}
            alt={photos[lightbox].caption ?? `Foto ${lightbox + 1}`}
            style={{
              maxWidth: "min(1200px, 96vw)",
              maxHeight: "80vh",
              objectFit: "contain",
              borderRadius: "4px",
            }}
            onClick={(e) => e.stopPropagation()}
          />

          {(photos[lightbox].caption || photos[lightbox].team_name) && (
            <div
              style={{
                marginTop: "12px", textAlign: "center",
                color: "rgba(255,255,255,0.85)", fontSize: "13px", lineHeight: 1.5,
              }}
            >
              {photos[lightbox].caption && <p style={{ margin: "0 0 2px" }}>{photos[lightbox].caption}</p>}
              <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.55)", fontStyle: "italic" }}>
                Foto: {photos[lightbox].team_name} · {lightbox + 1}/{photos.length}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
