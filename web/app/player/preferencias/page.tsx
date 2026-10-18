"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast }    from "@/components/ui/toaster";
import { createClient } from "@/lib/supabase/client";

export default function PreferenciasPage() {
  const [currentPwd,  setCurrentPwd]  = useState("");
  const [newPwd,      setNewPwd]      = useState("");
  const [confirmPwd,  setConfirmPwd]  = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [saving,      setSaving]      = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) {
      toast({ title: "A password deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    if (newPwd !== confirmPwd) {
      toast({ title: "As passwords não coincidem", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Re-authenticate with current password first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast({ title: "Erro: sessão inválida", variant: "destructive" });
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      });
      if (signInErr) {
        toast({ title: "Password actual incorrecta", variant: "destructive" });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) {
        toast({ title: "Erro ao alterar password", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Password alterada com sucesso" });
        setCurrentPwd("");
        setNewPwd("");
        setConfirmPwd("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Preferências</h1>
        <p className="text-muted-foreground">Segurança e notificações da tua conta.</p>
      </div>

      {/* Password change */}
      <form onSubmit={handlePasswordChange}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Alterar Password</CardTitle>
            </div>
            <CardDescription>Usa uma password forte com pelo menos 8 caracteres.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pwd">Password actual</Label>
              <div className="relative">
                <Input
                  id="current-pwd"
                  type={showCurrent ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrent((v) => !v)}
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">Nova password</Label>
              <div className="relative">
                <Input
                  id="new-pwd"
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNew((v) => !v)}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd">Confirmar nova password</Label>
              <Input
                id="confirm-pwd"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-4">
          <Button
            type="submit"
            disabled={saving || !currentPwd || !newPwd || !confirmPwd}
            className="gap-2"
            style={{ backgroundColor: "var(--club-primary, #111111)", color: "var(--club-primary-fg, #fff)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar password
          </Button>
        </div>
      </form>

      <Separator />

      {/* Notifications — placeholder for future implementation */}
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>Em breve — configurações de notificações push e email.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Esta funcionalidade estará disponível numa próxima versão.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
