"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  UserPlus, Pencil, KeyRound, ShieldOff, ShieldCheck,
  Trash2, Users, Loader2, Copy, Check, Link2, ExternalLink, Mail,
  AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { Badge }     from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { CreatePlayerAccountModal } from "@/components/admin/create-player-account-modal";
import { createClient } from "@/lib/supabase/client";

import { ageLabel } from "@/lib/age";

// ─── Tipos ────────────────────────────────────────────────

interface PlayerInfo {
  id: string;
  number: number | null;
  position: string | null;
}

interface UserRow {
  id:          string;
  name:        string;
  email:       string;
  role:        "admin" | "treinador" | "jogador" | "seccionista";
  roles_extra: string[];
  birth_date:  string | null;
  active:      boolean;
  created_at:  string;
}

// ─── Helpers ──────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin:       "Admin",
  treinador:   "Treinador",
  jogador:     "Jogador",
  seccionista: "Seccionista",
  tesoureiro:  "Tesoureiro",
};

const ROLE_COLORS: Record<string, string> = {
  admin:       "bg-red-100 text-red-800",
  treinador:   "bg-blue-100 text-blue-800",
  jogador:     "bg-green-100 text-green-800",
  seccionista: "bg-purple-100 text-purple-800",
};

function Avatar({ name }: { name: string }) {
  const init = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: "var(--club-primary, #111111)" }}>
      {init}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────

export default function GestaoDeContasPage() {
  const [users,       setUsers]      = useState<UserRow[]>([]);
  const [playerMap,   setPlayerMap]  = useState<Record<string, PlayerInfo>>({});
  const [loading,     setLoading]    = useState(true);
  const [loadError,   setLoadError]  = useState<string | null>(null);
  const [search,      setSearch]     = useState("");
  const [createModal, setCreateModal]= useState(false);

  // edit modal
  const [editUser,    setEditUser]   = useState<UserRow | null>(null);
  const [editName,    setEditName]   = useState("");
  const [editRole,    setEditRole]   = useState("");
  const [editActive,  setEditActive] = useState(true);
  const [editSaving,  setEditSaving] = useState(false);

  // reset password modal
  const [resetUser,        setResetUser]        = useState<UserRow | null>(null);
  const [tempPass,         setTempPass]         = useState<string | null>(null);
  const [resetLoading,     setResetLoading]     = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [resetEmailSent,   setResetEmailSent]   = useState(false);
  const [resetEmailFallback, setResetEmailFallback] = useState(false);
  const [resetEmailError,  setResetEmailError]  = useState<string | null>(null);

  // delete modal
  const [deleteUser,  setDeleteUser] = useState<UserRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // toggle active modal
  const [toggleConfirm, setToggleConfirm] = useState<UserRow | null>(null);

  // activation link modal
  const [actUser,           setActUser]           = useState<UserRow | null>(null);
  const [actLink,           setActLink]           = useState<string | null>(null);
  const [actLoading,        setActLoading]        = useState(false);
  const [actResending,      setActResending]      = useState(false);
  const [actCopied,         setActCopied]         = useState(false);
  const [actEmailSent,      setActEmailSent]      = useState(false);
  const [actEmailDevFallback, setActEmailDevFallback] = useState(false);
  const [actEmailError,    setActEmailError]      = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Contas de utilizador (via API com service role)
      const res  = await fetch("/api/admin/users");
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setUsers(json.users ?? []);
      } else {
        const msg = json.error ?? "Erro ao carregar contas";
        setLoadError(msg);
        toast({ title: msg, variant: "destructive" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro inesperado";
      setLoadError(msg);
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }

    // Perfis desportivos — leitura directa via supabase client (mesmo padrão de use-roster)
    try {
      const supabase = createClient();
      const { data: playerRows } = await supabase
        .from("players")
        .select("id, user_id, number, position, created_at")
        .order("created_at", { ascending: false });
      const map: Record<string, PlayerInfo> = {};
      for (const p of playerRows ?? []) {
        const uid = p.user_id as string;
        if (uid && !map[uid]) {
          map[uid] = { id: p.id as string, number: p.number as number | null, position: p.position as string | null };
        }
      }
      setPlayerMap(map);
    } catch {
      // Não é bloqueante — a lista de contas já está disponível
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtro ────────────────────────────────────────────────
  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ── Editar ────────────────────────────────────────────────
  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditName(u.name);
    setEditRole(u.role);
    setEditActive(u.active);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          user_id: editUser.id,
          name:    editName.trim(),
          role:    editRole,
          active:  editActive,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast({ title: "Conta atualizada" });
        setEditUser(null);
        load();
      } else {
        toast({ title: "Erro", description: json.error, variant: "destructive" });
      }
    } finally {
      setEditSaving(false);
    }
  }

  // ── Repor password ────────────────────────────────────────
  async function handleResetPassword() {
    if (!resetUser) return;
    setResetLoading(true);
    setResetEmailSent(false);
    setResetEmailFallback(false);
    setResetEmailError(null);
    setTempPass(null);
    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: resetUser.id }),
      });
      const json = await res.json();
      if (res.ok) {
        setResetEmailSent(json.email_sent === true);
        setResetEmailFallback(json.email_fallback === true);
        setResetEmailError(json.email_error ?? null);
        // Só mostra a password se o email não foi enviado (fallback manual)
        setTempPass(json.temp_password ?? null);
      } else {
        toast({ title: "Erro ao repor password", description: json.error, variant: "destructive" });
        setResetUser(null);
      }
    } finally {
      setResetLoading(false);
    }
  }

  function closeResetModal() {
    setResetUser(null);
    setTempPass(null);
    setResetEmailSent(false);
    setResetEmailFallback(false);
    setResetEmailError(null);
  }

  function copyTempPass() {
    if (!tempPass) return;
    navigator.clipboard.writeText(tempPass);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Eliminar ──────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteUser) return;
    const targetId = deleteUser.id;
    setDeleteLoading(true);
    try {
      const res  = await fetch(`/api/admin/users?id=${targetId}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        toast({ title: "Conta eliminada", description: json.message });
        // Remoção imediata do estado local (não espera pelo reload)
        setUsers((prev) => prev.filter((u) => u.id !== targetId));
        setDeleteUser(null);
        // Recarregar do servidor para garantir consistência
        load();
      } else {
        toast({ title: "Erro ao eliminar conta", description: json.error, variant: "destructive" });
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Link de ativação ─────────────────────────────────────
  function closeActModal() {
    setActUser(null);
    setActLink(null);
    setActEmailSent(false);
    setActEmailDevFallback(false);
    setActEmailError(null);
  }

  async function openActivationLink(u: UserRow) {
    setActUser(u);
    setActLink(null);
    setActEmailSent(false);
    setActEmailDevFallback(false);
    setActEmailError(null);
    setActLoading(true);
    try {
      const res = await fetch("/api/admin/users/activation-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId: u.id, resendEmail: false }),
      });
      const json = await res.json();
      if (res.ok) {
        setActLink(json.activationLink);
      } else {
        toast({ title: "Erro", description: json.error, variant: "destructive" });
        setActUser(null);
      }
    } finally {
      setActLoading(false);
    }
  }

  async function handleResend() {
    if (!actUser || actResending) return;
    setActResending(true);
    setActEmailSent(false);
    setActEmailDevFallback(false);
    setActEmailError(null);
    try {
      const res = await fetch("/api/admin/users/activation-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId: actUser.id, resendEmail: true }),
      });
      const json = await res.json();
      if (res.ok) {
        setActLink(json.activationLink);
        setActEmailSent(json.emailSent === true);
        setActEmailDevFallback(json.emailDevFallback === true);
        setActEmailError(json.emailError ?? null);
        if (json.emailSent) {
          toast({ title: "Email enviado com sucesso" });
        } else if (json.emailError) {
          toast({ title: "Erro ao enviar email", description: json.emailError, variant: "destructive" });
        } else if (json.emailDevFallback) {
          toast({ title: "Modo dev — link impresso no terminal do servidor" });
        } else {
          toast({ title: "Email não enviado — RESEND_API_KEY não configurada", variant: "destructive" });
        }
      } else {
        toast({ title: "Erro ao reenviar", description: json.error, variant: "destructive" });
      }
    } finally {
      setActResending(false);
    }
  }

  function copyActLink() {
    if (!actLink) return;
    navigator.clipboard.writeText(actLink);
    setActCopied(true);
    setTimeout(() => setActCopied(false), 2500);
  }

  // ── Ativar / Desativar ────────────────────────────────────
  function toggleActive(u: UserRow) {
    setToggleConfirm(u);
  }

  async function confirmToggleActive() {
    if (!toggleConfirm) return;
    const u = toggleConfirm;
    setToggleConfirm(null);
    const res = await fetch("/api/admin/users", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: u.id, active: !u.active }),
    });
    if (res.ok) {
      toast({ title: u.active ? "Conta desativada" : "Conta ativada" });
      load();
    }
  }

  // ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestão de Contas
          </h1>
          <p className="text-muted-foreground">
            Contas de acesso à plataforma. Jogadores são criados aqui.
          </p>
        </div>
        <Button onClick={() => setCreateModal(true)} className="gap-1.5 shrink-0">
          <UserPlus className="h-4 w-4" />
          Criar Conta
        </Button>
      </div>

      {/* Barra de pesquisa + contador */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Pesquisar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {!loadError && (
          <span className="text-sm text-muted-foreground">
            {loading ? "A carregar…" : `${filtered.length} conta(s)`}
          </span>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium w-10"></th>
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Tipo</th>
              <th className="px-4 py-3 text-left font-medium">Estado</th>
              <th className="px-4 py-3 text-left font-medium">Jogador</th>
              <th className="px-4 py-3 text-left font-medium">Criado em</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : loadError ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 text-destructive/60" />
                    <p className="text-sm text-destructive">{loadError}</p>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Tentar novamente
                    </Button>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  {search ? "Nenhuma conta encontrada com esse critério." : "Ainda não existem contas criadas."}
                </td>
              </tr>
            ) : filtered.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Avatar name={u.name} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name}</div>
                  {u.birth_date && (
                    <div className="text-[11px] text-muted-foreground">{ageLabel(u.birth_date)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold w-fit ${ROLE_COLORS[u.role] ?? ""}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                    {(u.roles_extra ?? []).includes("player") && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold w-fit bg-green-100 text-green-800">
                        + Jogador
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.active
                    ? <Badge variant="outline" className="border-green-600 text-green-700 text-[11px]">Ativo</Badge>
                    : <Badge variant="outline" className="border-red-500 text-red-600 text-[11px]">Inativo</Badge>}
                </td>
                <td className="px-4 py-3 text-xs">
                  {(() => {
                    const p = playerMap[u.id];
                    if (!p) return <span className="text-muted-foreground">—</span>;
                    return (
                      <Link
                        href={`/jogadores/${p.id}`}
                        className="font-medium text-foreground hover:text-orange-600 hover:underline underline-offset-2 transition-colors"
                      >
                        {p.number != null ? `#${p.number}` : "Sem nº"}
                        {p.position ? ` · ${p.position}` : ""}
                      </Link>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(u.created_at).toLocaleDateString("pt-PT")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {/* Link de ativação — apenas para jogadores inativos */}
                    {u.role === "jogador" && !u.active && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-amber-600 hover:text-amber-700"
                        title="Link de ativação de conta"
                        onClick={() => openActivationLink(u)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      title="Editar conta" onClick={() => openEdit(u)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      title="Repor password" onClick={() => { setResetUser(u); setTempPass(null); }}>
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      title={u.active ? "Desativar conta" : "Ativar conta"}
                      onClick={() => toggleActive(u)}>
                      {u.active
                        ? <ShieldOff className="h-3.5 w-3.5 text-amber-600" />
                        : <ShieldCheck className="h-3.5 w-3.5 text-green-600" />}
                    </Button>
                    {u.email !== "darioleal8@gmail.com" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Eliminar conta" onClick={() => setDeleteUser(u)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Criar Conta ─────────────────────────── */}
      <CreatePlayerAccountModal
        open={createModal}
        onClose={(created) => { setCreateModal(false); if (created) load(); }}
      />

      {/* ── Modal: Editar Conta ────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={(v) => { if (!v) setEditUser(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Conta</DialogTitle>
          </DialogHeader>
          {editUser && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nome</Label>
                <Input id="edit-name" value={editName}
                  onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jogador">Jogador</SelectItem>
                    <SelectItem value="treinador">Treinador</SelectItem>
                    <SelectItem value="seccionista">Seccionista</SelectItem>
                    <SelectItem value="tesoureiro">Tesoureiro</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={editActive ? "ativo" : "inativo"}
                  onValueChange={(v) => setEditActive(v === "ativo")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">Email: {editUser.email}</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Repor Password ──────────────────────── */}
      <Dialog open={!!resetUser} onOpenChange={(v) => { if (!v) closeResetModal(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Repor Password
            </DialogTitle>
          </DialogHeader>
          {resetUser && (
            <div className="space-y-4">
              {/* Estado inicial — antes de gerar */}
              {!resetEmailSent && !resetEmailFallback && !resetEmailError && !tempPass && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Vai ser gerada uma password temporária para <strong>{resetUser.name}</strong>.
                    Um email será enviado automaticamente com as instruções de acesso.
                  </p>
                  <DialogFooter>
                    <Button variant="outline" onClick={closeResetModal}>Cancelar</Button>
                    <Button onClick={handleResetPassword} disabled={resetLoading} className="gap-1.5">
                      {resetLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Gerar Password
                    </Button>
                  </DialogFooter>
                </>
              )}

              {/* Estado pós-reset: email enviado com sucesso */}
              {(resetEmailSent || resetEmailFallback || resetEmailError !== null || tempPass) && (
                <>
                  {/* Email enviado via Resend/SMTP */}
                  {resetEmailSent && (
                    <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      Email enviado para <strong>{resetUser.email}</strong>. O utilizador deve verificar a caixa de entrada.
                    </div>
                  )}

                  {/* Dev fallback — sem email real */}
                  {resetEmailFallback && !resetEmailSent && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      Modo dev — email impresso no terminal do servidor. Partilha a password abaixo manualmente.
                    </div>
                  )}

                  {/* Erro no email */}
                  {resetEmailError && !resetEmailSent && (
                    <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                      <p className="font-medium mb-0.5">Erro ao enviar email</p>
                      <p className="font-mono break-all">{resetEmailError}</p>
                      <p className="mt-1">Partilha a password abaixo manualmente.</p>
                    </div>
                  )}

                  {/* Password temporária — só mostrada se o email falhou */}
                  {tempPass && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Partilha esta password com <strong>{resetUser.name}</strong>:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono tracking-widest">
                          {tempPass}
                        </code>
                        <Button variant="outline" size="icon" onClick={copyTempPass}>
                          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Esta password não voltará a ser mostrada.
                      </p>
                    </>
                  )}

                  <p className="text-xs text-muted-foreground">
                    O utilizador será obrigado a alterar a password no próximo login.
                  </p>

                  <DialogFooter>
                    <Button onClick={closeResetModal}>Fechar</Button>
                  </DialogFooter>
                </>
              )}

              {/* Spinner enquanto carrega */}
              {resetLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Link de Ativação ───────────────────── */}
      <Dialog open={!!actUser} onOpenChange={(v) => { if (!v) closeActModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-amber-600" />
              Link de Ativação
            </DialogTitle>
          </DialogHeader>

          {actUser && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Conta de <strong>{actUser.name}</strong> ({actUser.email}) aguarda ativação.
                Partilha o link abaixo para que o jogador possa ativar a conta.
              </p>

              {actLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : actLink ? (
                <>
                  {/* Banner: email real enviado */}
                  {actEmailSent && (
                    <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      Email enviado com sucesso para {actUser.email}
                    </div>
                  )}
                  {/* Banner: erro real ao enviar (ex: domínio não verificado) */}
                  {!actEmailSent && actEmailError && (
                    <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                      <p className="font-medium mb-0.5">Erro ao enviar email</p>
                      <p className="font-mono break-all">{actEmailError}</p>
                    </div>
                  )}
                  {/* Banner: modo dev (sem email real) */}
                  {!actEmailSent && !actEmailError && actEmailDevFallback && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      Modo dev — email impresso no terminal. Partilha o link abaixo manualmente.
                    </div>
                  )}

                  {/* Caixa do link */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Link de ativação · válido 24 horas
                    </p>
                    <div className="rounded-md border bg-muted p-3">
                      <p className="break-all font-mono text-[11px] leading-relaxed select-all">
                        {actLink}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm"
                        className="flex-1 gap-1.5 text-xs"
                        onClick={copyActLink}
                      >
                        {actCopied
                          ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copiado!</>
                          : <><Copy className="h-3.5 w-3.5" /> Copiar link</>}
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => window.open(actLink, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Testar
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              <DialogFooter className="gap-2 pt-1">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={actLoading || actResending || !actLink}
                  onClick={handleResend}
                >
                  {actResending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Mail className="h-4 w-4" />}
                  Reenviar email
                </Button>
                <Button onClick={closeActModal}>Fechar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Ativar / Desativar Conta ───────────── */}
      <Dialog open={!!toggleConfirm} onOpenChange={(v) => { if (!v) setToggleConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {toggleConfirm?.active
                ? <ShieldOff className="h-5 w-5 text-amber-600" />
                : <ShieldCheck className="h-5 w-5 text-green-600" />}
              {toggleConfirm?.active ? "Desativar Conta" : "Ativar Conta"}
            </DialogTitle>
          </DialogHeader>
          {toggleConfirm && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {toggleConfirm.active
                  ? <>Tens a certeza que queres <strong>desativar</strong> a conta de <strong>{toggleConfirm.name}</strong>? O utilizador perderá acesso à plataforma imediatamente.</>
                  : <>Tens a certeza que queres <strong>ativar</strong> a conta de <strong>{toggleConfirm.name}</strong>? O utilizador voltará a ter acesso à plataforma.</>}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setToggleConfirm(null)}>Cancelar</Button>
                <Button
                  variant={toggleConfirm.active ? "destructive" : "default"}
                  onClick={confirmToggleActive}
                >
                  {toggleConfirm.active ? "Desativar" : "Ativar"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Eliminar Conta ──────────────────────── */}
      <Dialog open={!!deleteUser} onOpenChange={(v) => { if (!v) setDeleteUser(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Eliminar Conta
            </DialogTitle>
          </DialogHeader>
          {deleteUser && (
            <div className="space-y-4">
              <p className="text-sm">
                Tens a certeza que queres eliminar a conta de <strong>{deleteUser.name}</strong>?
                Esta ação é irreversível.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancelar</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Eliminar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
