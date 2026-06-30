"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, Trash2, ImageIcon, Palette, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useClubSettings } from "@/lib/club-context";
import { cn } from "@/lib/utils";

// ── Extração de cor dominante via Canvas ─────────────────

async function extractDominantColors(file: File): Promise<{ primary: string; secondary: string }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 80;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); resolve({ primary: "#1e40af", secondary: "#dc2626" }); return; }

        ctx.drawImage(img, 0, 0, size, size);
        const pixels = ctx.getImageData(0, 0, size, size).data;

        // Agrupar cores em buckets (reduzir precisão para agrupar variações)
        const colorMap = new Map<string, number>();
        for (let i = 0; i < pixels.length; i += 4) {
          const r = Math.round(pixels[i]     / 32) * 32;
          const g = Math.round(pixels[i + 1] / 32) * 32;
          const b = Math.round(pixels[i + 2] / 32) * 32;
          const a = pixels[i + 3];
          // Ignorar pixels transparentes e tons muito claros (próximos de branco)
          if (a < 128) continue;
          if (r > 220 && g > 220 && b > 220) continue; // branco/cinzento claro
          const key = `${r},${g},${b}`;
          colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
        }

        // Ordenar por frequência
        const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);
        const toHex = (rgb: string) => {
          const [r, g, b] = rgb.split(",").map(Number);
          return "#" + [r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("");
        };

        const primary   = sorted[0] ? toHex(sorted[0][0]) : "#1e40af";
        const secondary = sorted[1] ? toHex(sorted[1][0]) : "#dc2626";

        URL.revokeObjectURL(url);
        resolve({ primary, secondary });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ primary: "#1e40af", secondary: "#dc2626" });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ primary: "#1e40af", secondary: "#dc2626" });
    };
    img.src = url;
  });
}

// ── Componente principal ──────────────────────────────────

export function LogoUpload() {
  const { settings, refresh } = useClubSettings();
  const inputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview]     = useState<string | null>(null);
  const [file, setFile]           = useState<File | null>(null);
  const [extractedColors, setExtractedColors] = useState<{ primary: string; secondary: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving]   = useState(false);
  const [extracting, setExtracting] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    // Validações client-side
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "Máximo 2 MB.", variant: "destructive" });
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(f.type)) {
      toast({ title: "Formato não suportado", description: "Usa PNG, JPG, SVG ou WEBP.", variant: "destructive" });
      return;
    }

    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);

    // Extrair cores automaticamente
    setExtracting(true);
    extractDominantColors(f).then((colors) => {
      setExtractedColors(colors);
      setExtracting(false);
    });
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);

    const fd = new FormData();
    fd.append("logo", file);
    if (extractedColors) {
      fd.append("primary_color",   extractedColors.primary);
      fd.append("secondary_color", extractedColors.secondary);
    }

    const res = await fetch("/api/club-settings/logo", { method: "POST", body: fd });
    const json = await res.json();

    setUploading(false);

    if (!res.ok) {
      toast({ title: "Erro ao guardar logotipo", description: json.error, variant: "destructive" });
      return;
    }

    toast({ title: "Logotipo atualizado!", description: "Visível em toda a aplicação." });
    setFile(null);
    setPreview(null);
    setExtractedColors(null);
    if (inputRef.current) inputRef.current.value = "";
    await refresh();
  }

  async function handleRemove() {
    if (!confirm("Remover logotipo do clube?")) return;
    setRemoving(true);
    const res = await fetch("/api/club-settings/logo", { method: "DELETE" });
    setRemoving(false);
    if (res.ok) {
      toast({ title: "Logotipo removido" });
      await refresh();
    } else {
      toast({ title: "Erro ao remover logotipo", variant: "destructive" });
    }
  }

  function handleDiscard() {
    setFile(null);
    setPreview(null);
    setExtractedColors(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const currentLogo = settings.logo_url;
  const displayLogo = preview ?? currentLogo;

  return (
    <div className="space-y-5">
      {/* Área de pré-visualização */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Logotipo atual / preview */}
        <div className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "relative flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed bg-muted/30 overflow-hidden transition-all",
              displayLogo ? "border-border bg-background shadow-sm" : "border-muted-foreground/30"
            )}
          >
            {displayLogo ? (
              <Image
                src={displayLogo}
                alt="Logotipo do clube"
                fill
                sizes="128px"
                className="object-contain p-2"
                unoptimized={displayLogo.startsWith("data:")}
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <ImageIcon className="h-8 w-8 opacity-40" />
                <span className="text-[10px]">Sem logotipo</span>
              </div>
            )}
            {preview && (
              <div className="absolute top-1 right-1">
                <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold text-white">NOVO</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {preview ? "Pré-visualização" : (currentLogo ? "Logotipo atual" : "Nenhum logotipo")}
          </p>
        </div>

        {/* Instruções + botões */}
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">Logotipo do Clube</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              PNG, JPG, SVG ou WEBP · Máximo 2 MB · Formato quadrado recomendado
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4" />
              {preview ? "Escolher outro" : "Selecionar imagem"}
            </Button>

            {currentLogo && !preview && (
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover
              </Button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Cores extraídas */}
      {(extractedColors || settings.logo_url) && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {extracting ? "A extrair cores..." : "Cores detectadas automaticamente"}
            </span>
            {extracting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {extractedColors && !extracting && (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            )}
          </div>

          <div className="flex gap-4">
            {[
              { label: "Cor principal",    color: extractedColors?.primary   ?? settings.primary_color },
              { label: "Cor secundária",   color: extractedColors?.secondary ?? settings.secondary_color },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-full border shadow-sm shrink-0"
                  style={{ backgroundColor: color }}
                  title={color}
                />
                <div>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{color}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Estas cores são guardadas no Supabase e podem ser usadas para personalizar o tema.
          </p>
        </div>
      )}

      {/* Botões guardar / descartar */}
      {preview && (
        <div className="flex gap-2">
          <Button onClick={handleUpload} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {uploading ? "A guardar..." : "Guardar logotipo"}
          </Button>
          <Button variant="outline" onClick={handleDiscard} disabled={uploading}>
            Descartar
          </Button>
        </div>
      )}
    </div>
  );
}
