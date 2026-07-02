"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { ChatThreadSummary } from "@/types/database";

export function ChatSettingsDialog({
  open,
  onClose,
  thread,
  isAdmin,
  onSave,
  onClearMessages,
  onDeleteThread,
}: {
  open: boolean;
  onClose: () => void;
  thread: ChatThreadSummary;
  isAdmin: boolean;
  onSave: (chatId: string, postPolicy: "all" | "admin_only") => Promise<boolean>;
  onClearMessages?: () => Promise<boolean>;
  onDeleteThread?: (chatId: string) => Promise<boolean>;
}) {
  const [postPolicy, setPostPolicy] = useState<"all" | "admin_only">(thread.post_policy);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isAnnouncement = thread.type === "announcement";
  const isGroup = thread.type === "group";

  function handleClose() {
    setConfirmClear(false);
    setConfirmDelete(false);
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const ok = await onSave(thread.id, postPolicy);
      if (ok) handleClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!onClearMessages) return;
    setClearing(true);
    try {
      await onClearMessages();
      setConfirmClear(false);
      handleClose();
    } finally {
      setClearing(false);
    }
  }

  async function handleDelete() {
    if (!onDeleteThread) return;
    setDeleting(true);
    try {
      const ok = await onDeleteThread(thread.id);
      if (ok) handleClose();
    } finally {
      setDeleting(false);
    }
  }

  const clearLabel = isAnnouncement ? "Limpar todos os comunicados" : "Limpar todas as mensagens";
  const clearConfirmLabel = isAnnouncement
    ? "Todos os comunicados serão eliminados permanentemente."
    : "Todas as mensagens serão eliminadas permanentemente.";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Definições — {thread.name ?? "conversa"}</DialogTitle>
        </DialogHeader>

        {/* Permissão de escrita — não aplicável a comunicados (sempre admin_only) */}
        {!isAnnouncement && (
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

        {isAdmin && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Zona de perigo</p>

              {/* Limpar mensagens / comunicados */}
              {confirmClear ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <p className="text-sm text-destructive">Tens a certeza? {clearConfirmLabel}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={handleClear} disabled={clearing} className="flex-1">
                      {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sim, limpar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmClear(false)} className="flex-1">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm" variant="outline"
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {clearLabel}
                </Button>
              )}

              {/* Eliminar grupo — apenas para grupos, não para equipa nem comunicados */}
              {isGroup && (
                confirmDelete ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                    <p className="text-sm text-destructive">Tens a certeza? O grupo e todas as mensagens serão eliminados.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1">
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sim, eliminar"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm" variant="destructive"
                    className="w-full"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Eliminar grupo
                  </Button>
                )
              )}
            </div>
          </>
        )}

        {/* Botão Guardar — só relevante quando há post_policy editável */}
        {!isAnnouncement && (
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
