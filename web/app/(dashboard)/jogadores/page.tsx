"use client";

import { useState, useEffect, useCallback } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { useRoster } from "@/hooks/use-roster";
import { RosterTable } from "@/components/players/roster-table";
import { RosterCards } from "@/components/players/roster-cards";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { toast }     from "@/components/ui/toaster";
import { Camera, RefreshCw, UserPlus } from "lucide-react";
import type { RosterEntry, PlayerPosition } from "@/types/database";
import { CreatePlayerAccountModal } from "@/components/admin/create-player-account-modal";
import {
  PhotoUploadWithTemplate,
  type PhotoUploadResult,
} from "@/components/players/photo-upload-with-template";
import type { PhotoTemplateConfig } from "@/lib/photo-composite";

interface EditForm {
  number:   string;
  position: PlayerPosition | "";
  height:   string;
  weight:   string;
  age:      string;
}

const EMPTY_EDIT: EditForm = { number: "", position: "", height: "", weight: "", age: "" };

export default function JogadoresPage() {
  const { seasons, activeSeason, loading: seasonsLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

  const { players, loading, updatePlayer, updatePlayerPhoto, deletePlayer } = useRoster(seasonId);

  const [template,     setTemplate]     = useState<PhotoTemplateConfig | null>(null);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [photoUpload,  setPhotoUpload]  = useState(false);   // mostrar PhotoUploadWithTemplate
  const [editing,      setEditing]      = useState<RosterEntry | null>(null);
  const [formData,     setFormData]     = useState<EditForm>(EMPTY_EDIT);
  const [photoResult,  setPhotoResult]  = useState<PhotoUploadResult | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [accountModal, setAccountModal] = useState(false);

  // Carregar template do clube uma vez
  useEffect(() => {
    fetch("/api/club-settings/photo-template")
      .then((r) => r.json())
      .then(({ template: t }) => { if (t) setTemplate(t); })
      .catch(() => {});
  }, []);

  function openEdit(player: RosterEntry) {
    setEditing(player);
    setFormData({
      number:   player.number?.toString()  ?? "",
      position: player.position            ?? "",
      height:   player.height?.toString()  ?? "",
      weight:   player.weight?.toString()  ?? "",
      age:      player.age?.toString()     ?? "",
    });
    setPhotoResult(null);
    setPhotoUpload(false);
    const display = player.processed_photo_url ?? player.original_photo_url ?? player.photo_url ?? null;
    setPhotoPreview(display);
    setDialogOpen(true);
  }

  function handlePhotoConfirm(result: PhotoUploadResult) {
    setPhotoResult(result);
    // Mostrar preview da foto processada ou original
    const previewSrc = result.processedBlob
      ? URL.createObjectURL(result.processedBlob)
      : result.originalFile.size > 0
        ? URL.createObjectURL(result.originalFile)
        : photoPreview;
    setPhotoPreview(previewSrc);
    setPhotoUpload(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    try {
      const ok = await updatePlayer(editing.player_id, editing.user_id, {
        number:   formData.number   ? Number(formData.number)   : null,
        position: (formData.position as PlayerPosition) || null,
        height:   formData.height   ? Number(formData.height)   : null,
        weight:   formData.weight   ? Number(formData.weight)   : null,
        age:      formData.age      ? Number(formData.age)      : null,
      });
      if (photoResult && photoResult.originalFile.size > 0) {
        await updatePlayerPhoto(editing.player_id, editing.user_id, photoResult.originalFile, {
          processedBlob:   photoResult.processedBlob ?? undefined,
          focalY:          photoResult.focalY,
          focalX:          photoResult.focalX,
          templateVersion: photoResult.templateVersion,
        });
      }
      if (ok) setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const avatarSrc = photoPreview;
  const initials  = editing?.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "";

  return (
    <div className="space-y-4">
      {/* Cabeçalho (1 linha mobile) */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-condensed font-bold text-2xl uppercase tracking-display"
            style={{ color: "var(--ink,#0A1220)" }}>
            Plantel
          </h1>
          <p className="text-[12px]" style={{ color: "var(--muted-text,#5A6478)" }}>
            {players.length} jogador{players.length !== 1 ? "es" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Select value={seasonId ?? ""} onValueChange={setSelectedSeasonId} disabled={seasonsLoading}>
            <SelectTrigger className="w-36 md:w-48 h-9 text-sm">
              <SelectValue placeholder="Temporada" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.status === "ativa" ? "✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setAccountModal(true)}
            className="hidden md:flex gap-1.5 h-9">
            <UserPlus className="h-4 w-4" />
            Criar Conta
          </Button>
        </div>
      </div>

      {/* Mobile: grelha de cartões 2×2 */}
      <div className="md:hidden">
        <RosterCards
          players={players}
          loading={loading}
          onEdit={openEdit}
          onDelete={(p) => deletePlayer(p.player_id ?? null, p.name)}
        />
      </div>

      {/* Tablet+: tabela completa */}
      <div className="hidden md:block">
        <RosterTable
          players={players}
          loading={loading}
          onEdit={openEdit}
          onDelete={(p) => deletePlayer(p.player_id ?? null, p.name)}
          onCreateAccount={() => setAccountModal(true)}
        />
      </div>

      {/* FAB mobile — Criar conta de jogador */}
      <button
        type="button"
        onClick={() => setAccountModal(true)}
        aria-label="Criar conta de jogador"
        className="md:hidden fixed right-4 z-40 flex items-center gap-2 h-14 px-5 rounded-full shadow-lg font-semibold text-sm"
        style={{
          bottom: "calc(var(--bottom-nav-h, 56px) + 12px)",
          background: "var(--ink,#0A1220)",
          color: "#fff",
          touchAction: "manipulation",
        }}
      >
        <UserPlus className="h-5 w-5" />
        Conta
      </button>

      {/* Diálogo Editar Jogador */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!submitting) setDialogOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {editing?.name}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Foto */}
            {photoUpload ? (
              <PhotoUploadWithTemplate
                template={template}
                existingUrl={editing?.original_photo_url ?? editing?.photo_url}
                onConfirm={handlePhotoConfirm}
                onCancel={() => setPhotoUpload(false)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="relative group cursor-pointer" onClick={() => setPhotoUpload(true)}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="Foto"
                      className="h-24 w-24 rounded-full object-cover ring-2 ring-border" />
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-muted ring-2 ring-border flex items-center justify-center">
                      {initials
                        ? <span className="text-2xl font-bold text-muted-foreground">{initials}</span>
                        : <Camera className="h-8 w-8 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>
                <button type="button"
                  className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setPhotoUpload(true)}>
                  {avatarSrc ? "Alterar foto" : "Adicionar foto"}
                </button>
                {photoResult && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    Nova foto seleccionada {photoResult.processedBlob ? "(com template)" : ""}
                  </span>
                )}
              </div>
            )}

            {/* Campos desportivos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-number">Nº Camisola</Label>
                <Input id="p-number" type="number" min={0} max={99} placeholder="8"
                  value={formData.number}
                  onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-position">Posição</Label>
                <Select value={formData.position}
                  onValueChange={(v) => setFormData((p) => ({ ...p, position: v as PlayerPosition }))}>
                  <SelectTrigger id="p-position"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="extremo">Extremo</SelectItem>
                    <SelectItem value="poste">Poste</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-height">Altura (cm)</Label>
                <Input id="p-height" type="number" min={100} max={260} placeholder="182"
                  value={formData.height}
                  onChange={(e) => setFormData((p) => ({ ...p, height: e.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-weight">Peso (kg)</Label>
                <Input id="p-weight" type="number" min={30} max={200} step={0.1} placeholder="85"
                  value={formData.weight}
                  onChange={(e) => setFormData((p) => ({ ...p, weight: e.target.value }))} />
              </div>

              {/* Idade calculada automaticamente de birth_date — campo manual apenas como fallback */}
              {!editing?.birth_date && (
                <div className="space-y-1.5">
                  <Label htmlFor="p-age">Idade (manual)</Label>
                  <Input id="p-age" type="number" min={10} max={100} placeholder="35"
                    value={formData.age}
                    onChange={(e) => setFormData((p) => ({ ...p, age: e.target.value }))} />
                  <p className="text-[11px] text-muted-foreground">
                    Preenche a data de nascimento na conta do jogador para calcular automaticamente.
                  </p>
                </div>
              )}
            </div>


            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Criar Conta */}
      <CreatePlayerAccountModal
        open={accountModal}
        onClose={(created) => {
          setAccountModal(false);
          // Se criou um jogador, recarregar o plantel
          if (created) {
            // useRoster recarrega automaticamente via useEffect
          }
        }}
      />
    </div>
  );
}
