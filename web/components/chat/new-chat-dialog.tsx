"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { canCreateGroup } from "@/lib/chat/permissions";
import type { AppUser } from "@/hooks/use-current-user";

interface Contact {
  id: string;
  name: string;
  role: "admin" | "treinador" | "jogador";
  photo_url: string | null;
}

export function NewChatDialog({
  open,
  onClose,
  currentUser,
  onCreateDirect,
  onCreateGroup,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: AppUser;
  onCreateDirect: (userId: string) => Promise<void>;
  onCreateGroup: (name: string, participantIds: string[], postPolicy: "all" | "admin_only") => Promise<void>;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [postPolicy, setPostPolicy] = useState<"all" | "admin_only">("all");
  const [submitting, setSubmitting] = useState(false);

  const allowGroups = canCreateGroup(currentUser.role);

  useEffect(() => {
    if (!open) return;
    setMode("direct");
    setSelectedIds([]);
    setGroupName("");
    setPostPolicy("all");
    setLoading(true);
    fetch("/api/chat/contacts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setContacts(data.contacts ?? []))
      .finally(() => setLoading(false));
  }, [open]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleDirectClick(id: string) {
    setSubmitting(true);
    try { await onCreateDirect(id); } finally { setSubmitting(false); }
  }

  async function handleGroupSubmit() {
    if (!groupName.trim() || selectedIds.length === 0) return;
    setSubmitting(true);
    try { await onCreateGroup(groupName.trim(), selectedIds, postPolicy); } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>

        {allowGroups && (
          <div className="flex gap-2">
            <Button
              variant={mode === "direct" ? "default" : "outline"}
              size="sm" className="flex-1 gap-1.5"
              onClick={() => setMode("direct")}
            >
              <MessageCircle className="h-3.5 w-3.5" /> Direta
            </Button>
            <Button
              variant={mode === "group" ? "default" : "outline"}
              size="sm" className="flex-1 gap-1.5"
              onClick={() => setMode("group")}
            >
              <Users className="h-3.5 w-3.5" /> Grupo
            </Button>
          </div>
        )}

        <Separator />

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            {mode === "group" && (
              <div className="space-y-1.5">
                <Label htmlFor="group-name">Nome do grupo *</Label>
                <Input id="group-name" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ex: Equipa Técnica" />
              </div>
            )}

            {mode === "group" && currentUser.role === "admin" && (
              <div className="space-y-1.5">
                <Label>Permissão de escrita</Label>
                <Select value={postPolicy} onValueChange={(v) => setPostPolicy(v as "all" | "admin_only")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos podem escrever</SelectItem>
                    <SelectItem value="admin_only">Só leitura (apenas administradores escrevem)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {contacts.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">Sem contactos disponíveis.</p>
              )}
              {contacts.map((c) => (
                <button
                  key={c.id}
                  disabled={submitting}
                  onClick={() => (mode === "direct" ? handleDirectClick(c.id) : toggleSelect(c.id))}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    mode === "group" && selectedIds.includes(c.id) && "bg-accent"
                  )}
                >
                  <span>{c.name}</span>
                  <span className="text-xs capitalize text-muted-foreground">{c.role}</span>
                </button>
              ))}
            </div>

            {mode === "group" && (
              <DialogFooter>
                <Button onClick={handleGroupSubmit} disabled={submitting || !groupName.trim() || selectedIds.length === 0}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar grupo"}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
