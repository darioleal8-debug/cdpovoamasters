"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Pencil, FileText } from "lucide-react";
import { useTrainingNotes } from "@/hooks/use-trainings";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import type { Training } from "@/types/database";

interface Props {
  training: Training | null;
  open: boolean;
  onClose: () => void;
}

export function NotesModal({ training, open, onClose }: Props) {
  const { notes, loading, addNote, editNote, deleteNote } = useTrainingNotes(training?.id ?? null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    const ok = await addNote(text.trim());
    if (ok) setText("");
    setSaving(false);
  }

  function startEdit(noteId: string, currentText: string) {
    setEditingId(noteId);
    setEditText(currentText);
  }

  async function handleSaveEdit(noteId: string) {
    if (!editText.trim()) return;
    const ok = await editNote(noteId, editText.trim());
    if (ok) setEditingId(null);
  }

  if (!training) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notas — {training.date} · {training.start_time.slice(0, 5)}h
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{training.location}</p>
        </DialogHeader>

        {/* Lista de notas existentes */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))
            : notes.length === 0
            ? <p className="py-6 text-center text-sm text-muted-foreground">
                Sem notas para este treino.
              </p>
            : notes.map((note) => (
                <div key={note.id} className="group rounded-lg border bg-card p-3 space-y-1">
                  {editingId === note.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full min-h-[60px] rounded-md border bg-background px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-7" onClick={() => setEditingId(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" className="h-7" onClick={() => handleSaveEdit(note.id)} disabled={!editText.trim()}>
                          Guardar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm whitespace-pre-wrap flex-1">{note.note_text}</p>
                      <div className="flex shrink-0 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(note.id, note.note_text)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Editar nota"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="text-destructive hover:text-destructive/80"
                          title="Apagar nota"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {format(parseISO(note.created_at), "d MMM yyyy 'às' HH:mm", { locale: pt })}
                  </p>
                </div>
              ))}
        </div>

        {/* Adicionar nova nota */}
        <div className="border-t pt-3 space-y-2">
          <textarea
            className="w-full min-h-[70px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Escreve uma nota sobre o treino..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Ctrl+Enter para guardar</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
              <Button size="sm" onClick={handleAdd} disabled={saving || !text.trim()}>
                {saving ? "A guardar..." : "Adicionar Nota"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
