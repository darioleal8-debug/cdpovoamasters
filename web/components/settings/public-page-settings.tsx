"use client";

import { useState, useEffect } from "react";
import { Loader2, ExternalLink, Globe, GlobeLock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toaster";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function PublicPageSettings() {
  const supabase = createClient();
  const [slug, setSlug] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [clubName, setClubName] = useState("");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("club_settings")
      .select("id, club_name, slug, is_public")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id);
          setClubName(data.club_name ?? "");
          setSlug(data.slug ?? "");
          setIsPublic(data.is_public ?? false);
        }
        setLoading(false);
      });
  }, []);

  function handleClubNameSlug() {
    if (clubName && !slug) setSlug(slugify(clubName));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settingsId) return;
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      toast({ title: "Slug inválido", description: "Usa apenas letras minúsculas, números e hífens.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("club_settings")
      .update({ slug: slug || null, is_public: isPublic })
      .eq("id", settingsId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Página pública guardada" });
    }
  }

  const publicUrl = slug ? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.hoophub.pt"}/equipa/${slug}` : null;

  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted/40" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-md">
      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="pub-slug">URL da página pública</Label>
        <div className="flex gap-2">
          <span className="flex items-center rounded-l-md border border-r-0 bg-muted/50 px-3 text-[13px] text-muted-foreground whitespace-nowrap">
            /equipa/
          </span>
          <Input
            id="pub-slug"
            className="rounded-l-none"
            placeholder="cd-povoa-masters"
            value={slug}
            onFocus={handleClubNameSlug}
            onChange={(e) => setSlug(slugify(e.target.value))}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Apenas letras minúsculas, números e hífens. Gerado automaticamente a partir do nome do clube se deixares vazio ao focar.
        </p>
      </div>

      {/* Visibilidade */}
      <div className="flex items-start gap-3 rounded-lg border p-4">
        <Checkbox
          id="pub-visible"
          checked={isPublic}
          onCheckedChange={(v) => setIsPublic(v === true)}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="pub-visible" className="flex items-center gap-2 cursor-pointer font-medium">
            {isPublic ? (
              <Globe className="h-4 w-4 text-green-600" />
            ) : (
              <GlobeLock className="h-4 w-4 text-muted-foreground" />
            )}
            {isPublic ? "Página pública ativa" : "Página pública desativada"}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isPublic
              ? "Qualquer pessoa pode ver o plantel, calendário e resultados."
              : "A página está oculta ao público. Só membros autenticados acedem à app."}
          </p>
        </div>
      </div>

      {/* Link de pré-visualização */}
      {slug && isPublic && (
        <a
          href={`/equipa/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[13px] font-medium text-cdpovoa-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {publicUrl}
        </a>
      )}

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Guardar
      </Button>
    </form>
  );
}
