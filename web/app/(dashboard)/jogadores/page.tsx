"use client";

import { useState, useRef, useCallback } from "react";
import { useSeasons } from "@/hooks/use-seasons";
import { useRoster } from "@/hooks/use-roster";
import { RosterTable } from "@/components/players/roster-table";
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
import type { Player, PlayerPosition } from "@/types/database";
import { CreatePlayerAccountModal } from "@/components/admin/create-player-account-modal";

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

  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editing,     setEditing]     = useState<Player | null>(null);
  const [formData,    setFormData]    = useState<EditForm>(EMPTY_EDIT);
  const [photoFile,   setPhotoFile]   = useState<File | null>(null);
  const [photoPreview,setPhotoPreview]= useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [accountModal,setAccountModal]= useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Formato inválido", description: "Usa JPG, PNG ou WebP", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Ficheiro muito grande", description: "Máximo 5 MB", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }, []);

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function openEdit(player: Player) {
    setEditing(player);
    setFormData({
      number:   player.number?.toString()  ?? "",
      position: player.position            ?? "",
      height:   player.height?.toString()  ?? "",
      weight:   player.weight?.toString()  ?? "",
      age:      player.age?.toString()     ?? "",
    });
    setPhotoFile(null);
    setPhotoPreview(player.photo_url ?? null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSubmitting(true);
    try {
      const ok = await updatePlayer(editing.id, {
        number:   formData.number   ? Number(formData.number)   : null,
        position: (formData.position as PlayerPosition) || null,
        height:   formData.height   ? Number(formData.height)   : null,
        weight:   formData.weight   ? Number(formData.weight)   : null,
        age:      formData.age      ? Number(formData.age)      : null,
      });
      if (photoFile) await updatePlayerPhoto(editing.id, photoFile);
      if (ok) setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const avatarSrc = photoPreview ?? (editing?.photo_url ?? null);
  const initials  = editing?.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "";

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jogadores</h1>
          <p className="text-muted-foreground">Plantel por temporada</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAccountModal(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Criar Conta de Jogador
          </Button>

          <Select value={seasonId ?? ""} onValueChange={setSelectedSeasonId} disabled={seasonsLoading}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Selecionar temporada" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.status === "ativa" ? "✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela só-leitura para addPlayer — edit via RosterTable */}
      <RosterTable
        players={players}
        loading={loading}
        onEdit={openEdit}
        onDelete={(p) => deletePlayer(p.id, p.name)}
        onCreateAccount={() => setAccountModal(true)}
      />

      {/* Diálogo Editar Jogador */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!submitting) setDialogOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {editing?.name}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Foto */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
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
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                className="sr-only" onChange={handlePhotoChange} />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button type="button" className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => photoInputRef.current?.click()}>
                  {avatarSrc ? "Alterar foto" : "Adicionar foto"}
                </button>
                {photoFile && (
                  <>
                    <span>·</span>
                    <button type="button"
                      className="underline underline-offset-2 text-destructive/70 hover:text-destructive"
                      onClick={clearPhoto}>
                      Remover
                    </button>
                  </>
                )}
              </div>
            </div>

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

              <div className="space-y-1.5">
                <Label htmlFor="p-age">Idade</Label>
                <Input id="p-age" type="number" min={10} max={100} placeholder="35"
                  value={formData.age}
                  onChange={(e) => setFormData((p) => ({ ...p, age: e.target.value }))} />
              </div>
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
