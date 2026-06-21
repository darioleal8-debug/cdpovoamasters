"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toaster";

export default function ConfiguracoesPage() {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
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
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerir o teu perfil e definições de conta</p>
      </div>

      {/* Perfil */}
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
              {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar Perfil
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Password */}
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
              {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              Alterar Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
