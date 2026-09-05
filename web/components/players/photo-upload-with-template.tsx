"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, SlidersHorizontal, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  compositePhoto,
  renderPreview,
  fileToDataUrl,
  type PhotoTemplateConfig,
} from "@/lib/photo-composite";

export interface PhotoUploadResult {
  originalFile:   File;
  processedBlob:  Blob | null;   // null quando template desactivado
  focalY:         number;
  focalX:         number;
  templateVersion:number;
}

interface Props {
  template:    PhotoTemplateConfig | null;
  onConfirm:   (result: PhotoUploadResult) => void;
  onCancel:    () => void;
  existingUrl?: string | null;
}

const PREVIEW_W = 240; // largura do canvas de preview em px

export function PhotoUploadWithTemplate({ template, onConfirm, onCancel, existingUrl }: Props) {
  const [file,        setFile]        = useState<File | null>(null);
  const [originalSrc, setOriginalSrc] = useState<string | null>(existingUrl ?? null);
  const [focalY,      setFocalY]      = useState(0.3);
  const [focalX,      setFocalX]      = useState(0.5);
  const [compositing, setCompositing] = useState(false);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  const templateActive = template?.enabled === true;

  // Renderizar preview sempre que file, focalY ou focalX mudam
  const updatePreview = useCallback(async () => {
    if (!canvasRef.current || !templateActive || !template) return;
    const src = file ?? originalSrc;
    if (!src) {
      await renderPreview(canvasRef.current, null, template, focalY, focalX);
      return;
    }
    await renderPreview(canvasRef.current, src, template, focalY, focalX);
  }, [file, originalSrc, focalY, focalX, template, templateActive]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(f.type)) {
      alert("Formato inválido. Usa JPG, PNG ou WebP.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      alert("Ficheiro demasiado grande. Máximo 10 MB.");
      return;
    }

    setFile(f);
    const src = await fileToDataUrl(f);
    setOriginalSrc(src);
    // reset focal point to defaults for new photo
    setFocalY(0.3);
    setFocalX(0.5);
  }

  async function handleConfirm() {
    if (!file && !originalSrc) return;
    setCompositing(true);
    try {
      let processedBlob: Blob | null = null;
      if (templateActive && template && (file || originalSrc)) {
        processedBlob = await compositePhoto(
          file ?? (originalSrc as string),
          template, focalY, focalX
        );
      }
      onConfirm({
        originalFile:    file ?? new File([], ""),
        processedBlob,
        focalY,
        focalX,
        templateVersion: template?.version ?? 0,
      });
    } catch (err) {
      console.error("Composite failed:", err);
      // Confirm without processed photo (graceful degradation)
      onConfirm({
        originalFile:    file ?? new File([], ""),
        processedBlob:   null,
        focalY,
        focalX,
        templateVersion: 0,
      });
    } finally {
      setCompositing(false);
    }
  }

  const hasPhoto = !!(file || originalSrc);

  return (
    <div className="space-y-4">
      {/* Layout: original | preview */}
      <div className={`flex gap-4 ${templateActive ? "items-start" : "justify-center"}`}>

        {/* Foto original */}
        <div className="flex flex-col items-center gap-2">
          {templateActive && (
            <p className="text-xs text-muted-foreground font-medium">Original</p>
          )}
          <div
            className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-dashed border-border hover:border-orange-400 transition-colors"
            style={{ width: templateActive ? 160 : 200, height: templateActive ? 160 : 200 }}
            onClick={() => inputRef.current?.click()}
          >
            {originalSrc ? (
              <img
                src={originalSrc}
                alt="Original"
                className="w-full h-full object-contain bg-muted"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted/50">
                <Camera className="h-8 w-8 text-muted-foreground" />
                <span className="text-xs text-muted-foreground text-center px-2">
                  Clica para selecionar
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => inputRef.current?.click()}
          >
            {originalSrc ? "Alterar" : "Selecionar foto"}
          </Button>
        </div>

        {/* Canvas preview (só com template activo) */}
        {templateActive && template && (
          <div className="flex flex-col items-center gap-2 flex-1">
            <p className="text-xs text-muted-foreground font-medium">
              Preview — Template do Clube
            </p>
            <canvas
              ref={canvasRef}
              width={PREVIEW_W}
              height={Math.round(PREVIEW_W * template.output.height / template.output.width)}
              className="rounded border border-border shadow-sm max-w-full"
              style={{ display: "block" }}
            />
          </div>
        )}
      </div>

      {/* Focal point sliders (só quando há template e foto) */}
      {templateActive && hasPhoto && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Enquadramento
          </div>

          {/* Focal Y */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Vertical (cima ↕ baixo)</span>
              <span>{Math.round(focalY * 100)}%</span>
            </div>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={focalY}
              onChange={(e) => setFocalY(parseFloat(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>

          {/* Focal X */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Horizontal (esq ↔ dir)</span>
              <span>{Math.round(focalX * 100)}%</span>
            </div>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={focalX}
              onChange={(e) => setFocalX(parseFloat(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
        </div>
      )}

      {/* Acções */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!hasPhoto || compositing}
          onClick={handleConfirm}
        >
          {compositing ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              A processar…
            </span>
          ) : (
            <>
              <Check className="h-3.5 w-3.5 mr-1" />
              Confirmar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
