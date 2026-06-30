"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Zap, Pencil, CalendarRange, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSeasons } from "@/hooks/use-seasons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import type { Season, SeasonFormData } from "@/types/database";
import { LogoUpload }         from "@/components/settings/logo-upload";
import { TeamKitsSettings }   from "@/components/settings/team-kits-settings";

const EMPTY_SEASON: SeasonFormData = { name: "", year: "", start_date: "", end_date: "" };

export default function ConfiguracoesPage() {
  const supabase = createClient();

  /* ── Perfil ── */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? "");
        supabase.from("users").select("name").eq("email", user.email!).single()
          .then(({ data }) => { if (data) setName(data.name); });
      }
    });
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("users").update({ name }).eq("email", user.email!);
    setSavingProfile(false);
    if (error) {
      toast({ title: "Erro ao guardar perfil", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil actualizado com sucesso" });
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast({ title: "Erro ao alterar password", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password alterada com sucesso" });
      setNewPassword("");
    }
  }

  /* ── Temporadas ── */
  const { seasons, activeSeason, loading: seasonsLoading, createSeason, updateSeason, activateSeason } = useSeasons();
  const [seasonDialog, setSeasonDialog] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [seasonForm, setSeasonForm] = useState<SeasonFormData>(EMPTY_SEASON);
  const [savingSeason, setSavingSeason] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  function openCreateSeason() {
    setEditingSeason(null);
    setSeasonForm(EMPTY_SEASON);
    setSeasonDialog(true);
  }

  function openEditSeason(s: Season) {
    setEditingSeason(s);
    setSeasonForm({ name: s.name, year: s.year, start_date: s.start_date, end_date: s.end_date });
    setSeasonDialog(true);
  }

  async function handleSeasonSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingSeason(true);
    const ok = editingSeason
      ? await updateSeason(editingSeason.id, seasonForm)
      : await createSeason(seasonForm);
    setSavingSeason(false);
    if (ok) setSeasonDialog(false);
  }

  async function handleActivate(id: string) {
    setActivating(id);
    await activateSeason(id);
    setActivating(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerir perfil, conta e temporadas</p>
      </div>

      {/* ── Logotipo do Clube ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Logotipo do Clube</CardTitle>
          <CardDescription>
            O logotipo é exibido na sidebar e em toda a aplicação. Formatos suportados: PNG, JPG, SVG, WEBP (máx. 2 MB).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUpload />
        </CardContent>
      </Card>

      <Separator />

      {/* ── Equipamentos ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Equipamentos</CardTitle>
          <CardDescription>
            Cores das camisolas e calções para jogos em casa e fora. As cores aparecem automaticamente ao lado dos nomes das equipas no calendário da liga.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamKitsSettings />
        </CardContent>
      </Card>

      <Separator />

      {/* ── Temporadas ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Temporadas</CardTitle>
            <CardDescription>
              Define qual a temporada atual e gere o histórico de épocas desportivas.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateSeason}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {seasonsLoading ? (
            <>
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </>
          ) : seasons.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ainda não existem temporadas. Cria a primeira acima.
            </p>
          ) : (
            seasons.map((s) => {
              const isActive = s.status === "ativa";
              const isActivating = activating === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    isActive ? "border-cdpovoa-blue/40 bg-cdpovoa-blue/5" : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      isActive ? "bg-cdpovoa-blue text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      <CalendarRange className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{s.name}</span>
                        {isActive && (
                          <Badge className="shrink-0 bg-cdpovoa-blue text-white text-[0.6rem] px-1.5 py-0">
                            Atual
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {s.year} · {new Date(s.start_date).toLocaleDateString("pt-PT")} — {new Date(s.end_date).toLocaleDateString("pt-PT")}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isActive ? (
                      <span className="flex items-center gap-1 text-xs text-cdpovoa-blue font-medium">
                        <Check className="h-3.5 w-3.5" /> Ativa
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-cdpovoa-blue text-cdpovoa-blue hover:bg-cdpovoa-blue hover:text-white"
                        disabled={isActivating !== null}
                        onClick={() => handleActivate(s.id)}
                      >
                        {isActivating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <><Zap className="mr-1 h-3 w-3" />Ativar</>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => openEditSeason(s)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ── Perfil ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Actualiza o teu nome de utilizador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="O teu nome" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">O email não pode ser alterado aqui.</p>
            </div>
            <Button type="submit" disabled={savingProfile || !name}>
              {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Perfil
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* ── Password ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Alterar Password</CardTitle>
          <CardDescription>Escolhe uma password forte com pelo menos 8 caracteres.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Password</Label>
              <Input
                id="new-password"
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" disabled={savingPassword || newPassword.length < 8}>
              {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Alterar Password
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Dialog criar/editar temporada ──────────────────── */}
      <Dialog open={seasonDialog} onOpenChange={setSeasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSeason ? "Editar Temporada" : "Nova Temporada"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSeasonSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-name">Nome *</Label>
              <Input
                id="s-name"
                required
                placeholder="Masters 2025/26"
                value={seasonForm.name}
                onChange={(e) => setSeasonForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-year">Ano *</Label>
              <Input
                id="s-year"
                required
                placeholder="2025/2026"
                value={seasonForm.year}
                onChange={(e) => setSeasonForm((p) => ({ ...p, year: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-start">Data de Início *</Label>
                <Input
                  id="s-start"
                  type="date"
                  required
                  value={seasonForm.start_date}
                  onChange={(e) => setSeasonForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-end">Data de Fim *</Label>
                <Input
                  id="s-end"
                  type="date"
                  required
                  value={seasonForm.end_date}
                  onChange={(e) => setSeasonForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSeasonDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingSeason}>
                {savingSeason && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingSeason ? "Guardar Alterações" : "Criar Temporada"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
