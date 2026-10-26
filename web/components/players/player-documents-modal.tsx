"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge }     from "@/components/ui/badge";
import { Skeleton }  from "@/components/ui/skeleton";
import { toast }     from "@/components/ui/toaster";
import { Plus, Trash2, ExternalLink, FileText } from "lucide-react";
import type { PlayerDocument, PlayerDocumentCategory, PlayerDocumentStatus } from "@/types/database";

// ─── Labels ────────────────────────────────────────────────────────────────

const CAT_LABEL: Record<PlayerDocumentCategory, string> = {
  licenca:         "Licença FPB",
  atestado_medico: "Atestado Médico",
  autorizacao:     "Autorização",
  seguro:          "Seguro",
  outro:           "Outro",
};

const STATUS_LABEL: Record<PlayerDocumentStatus, string> = {
  pendente:  "Pendente",
  entregue:  "Entregue",
  rejeitado: "Rejeitado",
  expirado:  "Expirado",
};

const STATUS_CLASS: Record<PlayerDocumentStatus, string> = {
  pendente:  "bg-yellow-50 text-yellow-800 border-yellow-200",
  entregue:  "bg-green-50  text-green-800  border-green-200",
  rejeitado: "bg-red-50    text-red-800    border-red-200",
  expirado:  "bg-gray-100  text-gray-600   border-gray-300",
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  open:      boolean;
  onClose:   () => void;
  playerId:  string;
  playerName: string;
  seasonId:  string;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

function usePlayerDocs(playerId: string, seasonId: string, open: boolean) {
  const [docs,    setDocs]    = useState<PlayerDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!open || !playerId || !seasonId) return;
    setLoading(true);
    const res  = await fetch(`/api/player-documents?season_id=${seasonId}&player_id=${playerId}`);
    const json = await res.json();
    setDocs(json.documents ?? []);
    setLoading(false);
  }, [open, playerId, seasonId]);

  useEffect(() => { load(); }, [load]);

  async function addDoc(body: Record<string, unknown>): Promise<boolean> {
    const res  = await fetch("/api/player-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { toast({ title: "Erro ao adicionar documento", description: json.error, variant: "destructive" }); return false; }
    toast({ title: "Documento adicionado" });
    await load();
    return true;
  }

  async function updateDoc(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const res  = await fetch(`/api/player-documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) { toast({ title: "Erro ao atualizar documento", description: json.error, variant: "destructive" }); return false; }
    setDocs((prev) => prev.map((d) => d.id === id ? json.document : d));
    return true;
  }

  async function deleteDoc(id: string): Promise<boolean> {
    const res = await fetch(`/api/player-documents/${id}`, { method: "DELETE" });
    if (!res.ok) { toast({ title: "Erro ao eliminar documento", variant: "destructive" }); return false; }
    toast({ title: "Documento eliminado" });
    setDocs((prev) => prev.filter((d) => d.id !== id));
    return true;
  }

  return { docs, loading, addDoc, updateDoc, deleteDoc };
}

// ─── Component ──────────────────────────────────────────────────────────────

const EMPTY_FORM = { title: "", category: "outro" as PlayerDocumentCategory, expires_at: "", notes: "" };

export function PlayerDocumentsModal({ open, onClose, playerId, playerName, seasonId }: Props) {
  const { docs, loading, addDoc, updateDoc, deleteDoc } = usePlayerDocs(playerId, seasonId, open);
  const [adding,  setAdding]  = useState(false);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const ok = await addDoc({
      player_id:  playerId,
      season_id:  seasonId,
      title:      form.title.trim(),
      category:   form.category,
      expires_at: form.expires_at || null,
      notes:      form.notes || null,
    });
    setSaving(false);
    if (ok) { setForm(EMPTY_FORM); setAdding(false); }
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentos — {playerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lista de documentos */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : docs.length === 0 && !adding ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum documento registado para este jogador.
            </p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{doc.title}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {CAT_LABEL[doc.category]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Select
                        value={doc.status}
                        onValueChange={(v) => updateDoc(doc.id, { status: v })}
                      >
                        <SelectTrigger className="h-6 text-[11px] w-28 px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as PlayerDocumentStatus[]).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${STATUS_CLASS[doc.status]}`}>
                        {STATUS_LABEL[doc.status]}
                      </Badge>
                      {doc.expires_at && (
                        <span className="text-[11px] text-muted-foreground">
                          Expira: {new Date(doc.expires_at).toLocaleDateString("pt-PT")}
                        </span>
                      )}
                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 hover:underline">
                          <ExternalLink className="h-3 w-3" /> Ver ficheiro
                        </a>
                      )}
                    </div>
                    {doc.notes && (
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">{doc.notes}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteDoc(doc.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Eliminar documento"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulário de adição */}
          {adding ? (
            <form onSubmit={handleAdd} className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="doc-title" className="text-xs">Título *</Label>
                  <Input id="doc-title" placeholder="Ex: Licença FPB 2025/26" required
                    value={form.title} onChange={(e) => set("title", e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => set("category", v as PlayerDocumentCategory)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(CAT_LABEL) as [PlayerDocumentCategory, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="doc-expires" className="text-xs">Data de expiração</Label>
                  <Input id="doc-expires" type="date" value={form.expires_at}
                    onChange={(e) => set("expires_at", e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="doc-notes" className="text-xs">Notas</Label>
                  <Input id="doc-notes" placeholder="Opcional..." value={form.notes}
                    onChange={(e) => set("notes", e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "A guardar…" : "Guardar"}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Adicionar documento
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
