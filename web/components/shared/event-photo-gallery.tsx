"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Plus, X, ChevronLeft, ChevronRight, Loader2, Trash2, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { compressImage, formatBytes } from "@/lib/compress-image";
import { useCurrentUser } from "@/hooks/use-current-user";

// ── Types ──────────────────────────────────────────────────

export interface EventPhoto {
  id: string;
  entity_type: "training" | "game";
  entity_id: string;
  user_id: string | null;
  uploader_name: string | null;
  photo_url: string;
  created_at: string;
}

interface Props {
  /** "training" ou "game" */
  entityType: "training" | "game";
  /** UUID do treino ou evento */
  entityId: string;
  /** Título opcional exibido acima da galeria */
  title?: string;
}

// ── Lightbox ───────────────────────────────────────────────

function Lightbox({
  photos,
  index,
  currentUserId,
  isAdmin,
  onClose,
  onNavigate,
  onDelete,
}: {
  photos: EventPhoto[];
  index: number;
  currentUserId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onDelete: (id: string) => void;
}) {
  const photo = photos[index];
  const canDelete = isAdmin || photo.user_id === currentUserId;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")      onClose();
      if (e.key === "ArrowLeft"  && index > 0)                  onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1)  onNavigate(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onNavigate]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Delete */}
      {canDelete && (
        <button
          className="absolute top-4 left-4 z-10 rounded-full bg-red-500/80 p-2 text-white hover:bg-red-500 transition-colors"
          onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
          title="Apagar foto"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      {/* Previous */}
      {index > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Image */}
      <img
        src={photo.photo_url}
        alt="Foto"
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {index < photos.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Caption */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-white/70 text-sm">
          {photo.uploader_name && <span className="font-medium text-white">{photo.uploader_name} · </span>}
          {new Date(photo.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="text-white/40 text-xs mt-0.5">{index + 1} / {photos.length}</p>
      </div>
    </div>
  );
}

// ── Upload preview dialog ──────────────────────────────────

function UploadDialog({
  preview,
  originalSize,
  compressedSize,
  uploading,
  onConfirm,
  onCancel,
}: {
  preview: string;
  originalSize: number;
  compressedSize: number;
  uploading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className="bg-background rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <p className="font-semibold text-sm">Pré-visualização</p>
          <button onClick={onCancel} disabled={uploading}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <img src={preview} alt="Preview" className="w-full max-h-64 object-contain bg-muted/30" />

        <div className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Original: <span className="font-medium text-foreground">{formatBytes(originalSize)}</span></p>
            <p>Após compressão: <span className="font-medium text-green-600">{formatBytes(compressedSize)}</span>
              {compressedSize < originalSize && (
                <span className="ml-1 text-green-600">
                  (−{Math.round((1 - compressedSize / originalSize) * 100)}%)
                </span>
              )}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={uploading}>
              Cancelar
            </Button>
            <Button className="flex-1 gap-1.5" onClick={onConfirm} disabled={uploading}>
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> A enviar…</>
                : <><Camera className="h-4 w-4" /> Confirmar</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export function EventPhotoGallery({ entityType, entityId, title }: Props) {
  const { user } = useCurrentUser();
  const [photos,       setPhotos]       = useState<EventPhoto[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [lightboxIdx,  setLightboxIdx]  = useState<number | null>(null);
  const [preview,      setPreview]      = useState<string | null>(null);
  const [compressed,   setCompressed]   = useState<Blob | null>(null);
  const [origSize,     setOrigSize]     = useState(0);
  const [uploading,    setUploading]    = useState(false);
  const [compressing,  setCompressing]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const apiBase = entityType === "training"
    ? `/api/trainings/${entityId}/photos`
    : `/api/events/${entityId}/photos`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiBase);
      if (res.ok) {
        const json = await res.json();
        setPhotos(json.photos ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  // Selecionar ficheiro → comprimir → mostrar preview
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!e.target) return;
    // Reset input so same file can be picked again
    (e.target as HTMLInputElement).value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Formato inválido", description: "Seleciona um ficheiro de imagem", variant: "destructive" });
      return;
    }

    setCompressing(true);
    try {
      const blob = await compressImage(file);
      setOrigSize(file.size);
      setCompressed(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      toast({ title: "Erro ao comprimir imagem", variant: "destructive" });
    } finally {
      setCompressing(false);
    }
  }

  function cancelUpload() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCompressed(null);
    setOrigSize(0);
  }

  async function confirmUpload() {
    if (!compressed) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", compressed, "photo.jpg");
      const res = await fetch(apiBase, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Erro ao enviar foto", description: json.error, variant: "destructive" });
        return;
      }
      toast({ title: "Foto adicionada!" });
      cancelUpload();
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photoId: string) {
    if (!confirm("Apagar esta foto?")) return;
    const res = await fetch(`${apiBase}?photoId=${photoId}`, { method: "DELETE" });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setLightboxIdx(null);
      toast({ title: "Foto apagada" });
    } else {
      const json = await res.json();
      toast({ title: "Erro ao apagar", description: json.error, variant: "destructive" });
    }
  }

  const isAdmin = user?.role === "admin";
  const currentUserId = user?.id ?? null;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Camera className="h-4 w-4" />
          {title ?? "Fotografias"}
          {photos.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal normal-case tracking-normal">
              {photos.length}
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8"
          onClick={() => fileRef.current?.click()}
          disabled={compressing}
        >
          {compressing
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Plus className="h-3.5 w-3.5" />}
          Adicionar Fotografia
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleFileChange}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-lg border border-dashed text-muted-foreground">
          <ImageOff className="h-8 w-8 opacity-30" />
          <p className="text-sm">Sem fotografias ainda</p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Ser o primeiro a adicionar
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <button
              key={p.id}
              className="relative aspect-square rounded-lg overflow-hidden group focus:outline-none focus:ring-2 focus:ring-primary"
              onClick={() => setLightboxIdx(i)}
              title={p.uploader_name ?? undefined}
            >
              <img
                src={p.photo_url}
                alt="Foto do evento"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                {p.uploader_name && (
                  <p className="text-white text-[10px] font-medium truncate leading-tight">
                    {p.uploader_name}
                  </p>
                )}
                <p className="text-white/70 text-[10px] truncate leading-tight">
                  {new Date(p.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIdx}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
          onDelete={handleDelete}
        />
      )}

      {/* Upload preview */}
      {preview && compressed && (
        <UploadDialog
          preview={preview}
          originalSize={origSize}
          compressedSize={compressed.size}
          uploading={uploading}
          onConfirm={confirmUpload}
          onCancel={cancelUpload}
        />
      )}
    </>
  );
}
