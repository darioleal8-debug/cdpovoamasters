"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, User } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast }    from "@/components/ui/toaster";
import { useCurrentUser } from "@/hooks/use-current-user";

const POSITIONS = [
  { value: "base",    label: "Base" },
  { value: "extremo", label: "Extremo" },
  { value: "poste",   label: "Poste" },
];

// Data máxima = hoje - 16 anos
function maxBirthDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 16);
  return d.toISOString().slice(0, 10);
}

export default function MeuPerfilPage() {
  const { user, player, loading, refresh } = useCurrentUser();

  const [name,      setName]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [position,  setPosition]  = useState("");
  const [height,    setHeight]    = useState("");
  const [weight,    setWeight]    = useState("");
  const [age,       setAge]       = useState("");
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setPhone(user.phone ?? "");
      setBirthDate(user.birth_date ?? "");
    }
    if (player) {
      setPosition(player.position ?? "");
      setHeight(player.height?.toString() ?? "");
      setWeight(player.weight?.toString() ?? "");
      setAge(player.age?.toString() ?? "");
    }
  }, [user, player]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:       name.trim(),
          phone:      phone.trim()     || null,
          birth_date: birthDate.trim() || null,
          position:   position || null,
          height:     height ? Number(height) : null,
          weight:     weight ? Number(weight) : null,
          age:        age    ? Number(age)    : null,
        }),
      });
      if (res.ok) { toast({ title: "Perfil actualizado" }); refresh(); }
      else { const j = await res.json(); toast({ title: "Erro", description: j.error, variant: "destructive" }); }
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">O Meu Perfil</h1>
        <p className="text-muted-foreground">Edita as tuas informações pessoais.</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-black text-white shadow"
          style={{ backgroundColor: "var(--club-primary, #111111)" }}>
          {user?.name?.[0]?.toUpperCase() ?? <User className="h-7 w-7" />}
        </div>
        <div>
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Dados Pessoais</CardTitle>
            <CardDescription>Nome, contacto e nascimento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Telemóvel</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="912345678 ou +351912345678"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="birth-date">Data de Nascimento</Label>
              <Input
                id="birth-date"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={maxBirthDate()}
              />
            </div>
          </CardContent>
        </Card>

        {player && (
          <Card>
            <CardHeader>
              <CardTitle>Dados de Jogador</CardTitle>
              <CardDescription>Informações desportivas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Posição</Label>
                <Select value={position} onValueChange={setPosition}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="height">Altura (cm)</Label>
                  <Input id="height" type="number" value={height}
                    onChange={(e) => setHeight(e.target.value)} min={100} max={260} placeholder="180" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weight">Peso (kg)</Label>
                  <Input id="weight" type="number" value={weight}
                    onChange={(e) => setWeight(e.target.value)} min={30} max={200} step={0.1} placeholder="85" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="age">Idade</Label>
                  <Input id="age" type="number" value={age}
                    onChange={(e) => setAge(e.target.value)} min={10} max={100} placeholder="35" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />
        <Button type="submit" disabled={saving} className="gap-2"
          style={{ backgroundColor: "var(--club-primary, #111111)", color: "var(--club-primary-fg, #fff)" }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Alterações
        </Button>
      </form>

      <Card className="border-muted bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            Para alterar o email ou password, contacta o administrador do clube.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
