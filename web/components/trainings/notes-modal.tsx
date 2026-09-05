"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Pencil, FileText, Pin } from "lucide-react";
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
            ? (
              <div className="py-8 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Sem notas para este treino.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Adiciona a primeira nota abaixo.</p>
              </div>
            )
            : notes.map((note, i) => (
                <div
                  key={note.id}
                  className="group rounded-lg border border-blue-200/60 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/20 p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-45 text-blue-500 dark:text-blue-400" />
                    {editingId === note.id ? (
                      <div className="flex-1 space-y-2">
                        <textarea
                          className="w-full min-h-[60px] rounded-md border bg-background px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                          value={editText}
                          maxLength={300}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                        />
                        <div className="flex items-center justify-between">
                          <span className={`text-[11px] ${editText.length > 270 ? "text-destructive" : "text-muted-foreground"}`}>
                            {editText.length}/300
                          </span>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-7" onClick={() => setEditingId(null)}>
                              Cancelar
                            </Button>
                            <Button size="sm" className="h-7" onClick={() => handleSaveEdit(note.id)}
                              disabled={!editText.trim() || editText.length > 300}>
                              Guardar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.note_text}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground/60">
                          Nota {i + 1} · {format(parseISO(note.created_at), "d MMM yyyy 'às' HH:mm", { locale: pt })}
                        </p>
                      </div>
                    )}
                    {editingId !== note.id && (
                      <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(note.id, note.note_text)}
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteNote(note.id)}
                          className="text-destructive hover:text-destructive/80 p-0.5 rounded" title="Apagar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
        </div>

        {/* Adicionar nova nota */}
        <div className="border-t pt-3 space-y-2">
          {notes.length >= 10 ? (
            <p className="text-xs text-center text-muted-foreground py-2 rounded-lg bg-muted/40">
              Máximo de 10 notas atingido. Remove uma para adicionar outra.
            </p>
          ) : (
            <>
              <textarea
                className="w-full min-h-[70px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Escreve uma nota (exercício, instrução, foco do treino…)"
                value={text}
                maxLength={300}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
                }}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${text.length > 270 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {text.length}/300
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {notes.length}/10 notas · Ctrl+Enter para guardar
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
                  <Button size="sm" onClick={handleAdd}
                    disabled={saving || !text.trim() || text.length > 300}>
                    {saving ? "A guardar..." : "Adicionar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
