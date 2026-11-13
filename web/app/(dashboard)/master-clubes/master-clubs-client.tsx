"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Plus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

interface Club { id: string; name: string; slug: string; active: boolean; members: number; league_team_name: string | null }
interface Team { id: string; name: string }
interface Member { user_id: string; name: string | null; email: string | null; role: string; active: boolean }

const ROLE_LABELS: Record<string, string> = { admin: "Admin", treinador: "Treinador", seccionista: "Seccionista", tesoureiro: "Tesoureiro" };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
const err = (msg?: string) => toast({ title: msg ?? "Erro", variant: "destructive" });

export function MasterClubsClient() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [openClub, setOpenClub] = useState<Club | null>(null);
  const [newClubOpen, setNewClubOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ clubs: Club[]; free_league_teams: Team[] }>("/api/master/clubs");
    if (!r.ok) err(r.data.error); else { setClubs(r.data.clubs); setTeams(r.data.free_league_teams); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(c: Club) {
    const next = !c.active;
    const msg = next
      ? `Ativar "${c.name}"? Os utilizadores do clube passam a poder entrar na app de gestão.`
      : `Desativar "${c.name}"? Os utilizadores do clube perdem o acesso.`;
    if (!window.confirm(msg)) return;
    const r = await api(`/api/master/clubs/${c.id}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
    if (!r.ok) return err(r.data.error);
    toast({ title: next ? "Clube ativado" : "Clube desativado" });
    load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Building2 className="h-5 w-5" /> Clubes da plataforma</h1>
          <p className="text-sm text-muted-foreground">Só o Master Admin vê esta página. Os clubes novos ficam inativos até serem ativados.</p>
        </div>
        <Button onClick={() => setNewClubOpen(true)}><Plus className="mr-1 h-4 w-4" /> Novo clube</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {clubs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{c.name}</span>
                  <Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Ativo" : "Inativo"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.slug}{c.league_team_name ? ` · Liga: ${c.league_team_name}` : ""} · {c.members} utilizador(es)
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpenClub(c)}><Users className="mr-1 h-4 w-4" /> Utilizadores</Button>
                <Button size="sm" variant={c.active ? "outline" : "default"} onClick={() => toggleActive(c)}>
                  {c.active ? "Desativar" : "Ativar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewClubDialog open={newClubOpen} onClose={() => setNewClubOpen(false)} teams={teams} onDone={load} />
      {openClub && <MembersDialog club={openClub} onClose={() => { setOpenClub(null); load(); }} />}
    </div>
  );
}

function NewClubDialog({ open, onClose, teams, onDone }: { open: boolean; onClose: () => void; teams: Team[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("none");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const r = await api("/api/master/clubs", { method: "POST", body: JSON.stringify({ name, league_team_id: team === "none" ? null : team }) });
    setBusy(false);
    if (!r.ok) return err(r.data.error);
    toast({ title: "Clube criado (inativo)" });
    setName(""); setTeam("none"); onClose(); onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo clube</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome do clube</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Equipa na Liga INATEL (opcional)</Label>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem equipa associada</SelectItem>
                {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 2}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ club, onClose }: { club: Club; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ members: Member[] }>(`/api/master/clubs/${club.id}/members`);
    if (r.ok) setMembers(r.data.members);
  }, [club.id]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    const r = await api(`/api/master/clubs/${club.id}/members`, { method: "POST", body: JSON.stringify(form) });
    setBusy(false);
    if (!r.ok) return err(r.data.error);
    toast({ title: "Utilizador criado" });
    setForm({ name: "", email: "", password: "", role: "admin" });
    load();
  }

  async function setActive(m: Member, active: boolean) {
    const r = await api(`/api/master/clubs/${club.id}/members/${m.user_id}`, { method: "PATCH", body: JSON.stringify({ active }) });
    if (!r.ok) return err(r.data.error);
    load();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{club.name} — utilizadores</DialogTitle></DialogHeader>
        {!club.active && <p className="rounded-lg bg-muted p-2 text-xs">Clube inativo: estes utilizadores só entram depois de o clube ser ativado.</p>}

        <div className="space-y-2">
          {members.length === 0 && <p className="text-sm text-muted-foreground">Sem utilizadores.</p>}
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.name ?? m.email}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email} · {ROLE_LABELS[m.role] ?? m.role}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setActive(m, !m.active)}>{m.active ? "Desativar" : "Ativar"}</Button>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="flex items-center gap-1 text-sm font-semibold"><UserPlus className="h-4 w-4" /> Novo utilizador (delegado)</p>
          <Input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="Password inicial (mín. 10 caracteres)" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="w-full" onClick={create} disabled={busy || !form.name || !form.email || form.password.length < 10}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Criar utilizador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
