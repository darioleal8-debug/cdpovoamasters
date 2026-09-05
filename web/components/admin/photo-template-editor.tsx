"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Image as ImageIcon, Save, RefreshCw, Upload, X, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  renderPreview,
  fileToDataUrl,
  DEFAULT_TEMPLATE,
  type PhotoTemplateConfig,
} from "@/lib/photo-composite";

const PREVIEW_W = 280;

export function PhotoTemplateEditor() {
  const [template,  setTemplate]  = useState<PhotoTemplateConfig>(DEFAULT_TEMPLATE);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [bgFile,    setBgFile]    = useState<File | null>(null);
  const [logoFile,  setLogoFile]  = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const bgRef      = useRef<HTMLInputElement>(null);
  const logoRef    = useRef<HTMLInputElement>(null);

  // Carregar template actual
  useEffect(() => {
    fetch("/api/club-settings/photo-template")
      .then((r) => r.json())
      .then(({ template: t }) => {
        if (t) setTemplate(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Re-render preview sempre que template muda
  const updatePreview = useCallback(async () => {
    if (!canvasRef.current) return;
    const src = bgPreview ?? template.background_url ?? null;
    await renderPreview(canvasRef.current, src, template, template.photo_area.y / template.output.height * 0.5, 0.5);
  }, [template, bgPreview]);

  useEffect(() => { updatePreview(); }, [updatePreview]);

  function patch(partial: Partial<PhotoTemplateConfig>) {
    setTemplate((prev) => ({ ...prev, ...partial }));
  }

  function patchPhotoArea(partial: Partial<PhotoTemplateConfig["photo_area"]>) {
    setTemplate((prev) => ({ ...prev, photo_area: { ...prev.photo_area, ...partial } }));
  }

  function patchOutput(partial: Partial<PhotoTemplateConfig["output"]>) {
    setTemplate((prev) => ({ ...prev, output: { ...prev.output, ...partial } }));
  }

  function patchLogoArea(partial: Partial<NonNullable<PhotoTemplateConfig["logo_area"]>>) {
    setTemplate((prev) => ({
      ...prev,
      logo_area: prev.logo_area
        ? { ...prev.logo_area, ...partial }
        : { x: 20, y: 20, width: 80, height: 80, ...partial },
    }));
  }

  async function handleBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const src = await fileToDataUrl(f);
    setBgFile(f);
    setBgPreview(src);
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const src = await fileToDataUrl(f);
    setLogoFile(f);
    setLogoPreview(src);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Upload background se foi alterado
      let bgUrl = template.background_url;
      if (bgFile) {
        const fd = new FormData();
        fd.append("file", bgFile);
        fd.append("type", "background");
        const r = await fetch("/api/club-settings/photo-template/assets", { method: "POST", body: fd });
        if (r.ok) {
          const d = await r.json();
          bgUrl = d.url;
        }
      }

      // Upload logo se foi alterado
      let logoUrl = template.logo_url;
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        fd.append("type", "logo");
        const r = await fetch("/api/club-settings/photo-template/assets", { method: "POST", body: fd });
        if (r.ok) {
          const d = await r.json();
          logoUrl = d.url;
        }
      }

      const toSave: PhotoTemplateConfig = { ...template, background_url: bgUrl, logo_url: logoUrl };

      const res = await fetch("/api/club-settings/photo-template", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(toSave),
      });

      if (!res.ok) {
        const d = await res.json();
        toast({ title: "Erro ao guardar template", description: d.error, variant: "destructive" });
        return;
      }

      const { template: saved } = await res.json();
      setTemplate(saved);
      setBgFile(null);
      setLogoFile(null);
      toast({ title: "Template guardado", description: `Versão ${saved.version}` });
    } catch (e) {
      toast({ title: "Erro de rede", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">A carregar configuração…</div>;
  }

  const previewH = Math.round(PREVIEW_W * template.output.height / template.output.width);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-orange-500" />
          <div>
            <h3 className="font-semibold">Template de Foto de Jogador</h3>
            <p className="text-xs text-muted-foreground">
              {template.enabled
                ? `Activo — v${template.version}`
                : "Desactivado — fotos sem template"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => patch({ enabled: !template.enabled })}
          className="gap-2"
        >
          {template.enabled
            ? <><ToggleRight className="h-4 w-4 text-orange-500" />Desactivar</>
            : <><ToggleLeft  className="h-4 w-4" />Activar</>}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuração */}
        <div className="space-y-4">

          {/* Dimensões de saída */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Dimensões de saída (px)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Largura</Label>
                <Input
                  type="number" min={200} max={2000}
                  value={template.output.width}
                  onChange={(e) => patchOutput({ width: parseInt(e.target.value) || 600 })}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Altura</Label>
                <Input
                  type="number" min={200} max={2000}
                  value={template.output.height}
                  onChange={(e) => patchOutput({ height: parseInt(e.target.value) || 800 })}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Background */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fundo
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                type="color"
                value={template.background_color}
                onChange={(e) => patch({ background_color: e.target.value })}
                className="h-8 w-12 p-0.5 cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">Cor de fundo</span>
            </div>
            <div className="flex gap-2 items-center">
              <Button
                type="button" variant="outline" size="sm"
                className="text-xs gap-1.5"
                onClick={() => bgRef.current?.click()}
              >
                <Upload className="h-3 w-3" />
                {bgFile ? bgFile.name : (template.background_url ? "Alterar imagem" : "Imagem de fundo")}
              </Button>
              {(bgFile || template.background_url) && (
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => { setBgFile(null); setBgPreview(null); patch({ background_url: null }); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <input ref={bgRef} type="file" accept="image/*" className="sr-only" onChange={handleBgFile} />
          </div>

          {/* Área da foto */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Área da Fotografia
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-xs capitalize">{k}</Label>
                  <Input
                    type="number" min={0} max={2000}
                    value={template.photo_area[k]}
                    onChange={(e) => patchPhotoArea({ [k]: parseInt(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Forma</Label>
              <select
                value={template.photo_shape}
                onChange={(e) => patch({ photo_shape: e.target.value as "rect" | "rounded" })}
                className="h-8 text-sm rounded border border-input bg-background px-2"
              >
                <option value="rect">Rectangular</option>
                <option value="rounded">Arredondada</option>
              </select>
              {template.photo_shape === "rounded" && (
                <Input
                  type="number" min={0} max={400}
                  placeholder="Raio"
                  value={template.photo_border_radius}
                  onChange={(e) => patch({ photo_border_radius: parseInt(e.target.value) || 0 })}
                  className="h-8 text-sm w-20"
                />
              )}
            </div>
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Logo do Clube (overlay)
            </Label>
            <div className="flex gap-2 items-center">
              <Button
                type="button" variant="outline" size="sm"
                className="text-xs gap-1.5"
                onClick={() => logoRef.current?.click()}
              >
                <Upload className="h-3 w-3" />
                {logoFile ? logoFile.name : (template.logo_url ? "Alterar logo" : "Carregar logo")}
              </Button>
              {(logoFile || template.logo_url) && (
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => { setLogoFile(null); setLogoPreview(null); patch({ logo_url: null, logo_area: null }); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <input ref={logoRef} type="file" accept="image/*" className="sr-only" onChange={handleLogoFile} />

            {(template.logo_url || logoFile) && (
              <div>
                <Label className="text-xs text-muted-foreground">Posição do logo</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {(["x", "y", "width", "height"] as const).map((k) => (
                    <div key={k}>
                      <Label className="text-xs capitalize">{k}</Label>
                      <Input
                        type="number" min={0} max={2000}
                        value={template.logo_area?.[k] ?? (k === "width" || k === "height" ? 80 : 20)}
                        onChange={(e) => patchLogoArea({ [k]: parseInt(e.target.value) || 0 })}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-col items-center gap-3">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground self-start">
            Preview
          </Label>
          <canvas
            ref={canvasRef}
            width={PREVIEW_W}
            height={previewH}
            className="rounded border border-border shadow max-w-full"
            style={{ display: "block" }}
          />
          <p className="text-xs text-muted-foreground text-center">
            Preview sem fotografia real.<br/>A área da foto mostra o placeholder.
          </p>
          {logoPreview && (
            <img src={logoPreview} alt="logo preview" className="h-10 object-contain opacity-70 rounded" />
          )}
        </div>
      </div>

      {/* Guardar */}
      <div className="flex justify-end pt-2 border-t">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving
            ? <><RefreshCw className="h-4 w-4 animate-spin" />A guardar…</>
            : <><Save className="h-4 w-4" />Guardar Template</>}
        </Button>
      </div>

      {template.enabled && (
        <p className="text-xs text-muted-foreground bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded p-2">
          Ao guardar um novo template, as fotos existentes não são automaticamente actualizadas.
          Para regenerar, edita o perfil de cada jogador e confirma a foto novamente.
        </p>
      )}
    </div>
  );
}
