"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ChatThreadSummary } from "@/types/database";

export function ChatSettingsDialog({
  open,
  onClose,
  thread,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  thread: ChatThreadSummary;
  onSave: (chatId: string, postPolicy: "all" | "admin_only") => Promise<boolean>;
}) {
  const [postPolicy, setPostPolicy] = useState<"all" | "admin_only">(thread.post_policy);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const ok = await onSave(thread.id, postPolicy);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Permissões de {thread.name ?? "conversa"}</DialogTitle>
        </DialogHeader>

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

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
