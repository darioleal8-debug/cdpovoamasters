"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive, Check, ChevronRight, Download, ExternalLink,
  MoreHorizontal, Pencil, Plus, Share2, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label }    from "@/components/ui/label";
import { toast }    from "@/components/ui/toaster";
import type { ClubDocument, DocumentCategory } from "@/types/database";

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES: DocumentCategory[] = [
  "regulamentos", "calendario", "financeiro", "seguros_saude", "clube", "formularios",
];

const CAT_LABEL: Record<DocumentCategory, string> = {
  regulamentos:  "Regulamentos",
  calendario:    "Calendário",
  financeiro:    "Financeiro",
  seguros_saude: "Seguros e Saúde",
  clube:         "Clube",
  formularios:   "Formulários",
};

const CAT_SHORT: Record<DocumentCategory, string> = {
  regulamentos:  "Regulamentos",
  calendario:    "Calendário",
  financeiro:    "Financeiro",
  seguros_saude: "Seguros",
  clube:         "Clube",
  formularios:   "Formulários",
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function normalise(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function isNew(updatedAt: string) {
  return Date.now() - new Date(updatedAt).getTime() < 7 * 86_400_000;
}

function currentSeason() {
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  return m >= 9 ? `${y}/${String(y + 1).slice(-2)}` : `${y - 1}/${String(y).slice(-2)}`;
}

// ─── PDF icon ────────────────────────────────────────────────────────────────

function PdfIcon({ size = 36 }: { size?: number }) {
  const w = Math.round(size * 0.75);
  return (
    <div
      className="flex items-end justify-center rounded-md shrink-0"
      style={{
        width: w, height: size,
        background: "#FDE7D6",
        border: "1.5px solid #F5C9A6",
      }}
    >
      <span
        className="text-[8px] font-black pb-0.5 tracking-wide"
        style={{ color: "#C2510C" }}
      >
        PDF
      </span>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ q }: { q: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "#F3F0EB" }}>
        <PdfIcon size={32} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "#4A443D" }}>
        {q ? "Nenhum documento encontrado." : "Sem documentos publicados."}
      </p>
      {q && (
        <p className="text-xs" style={{ color: "#8F877C" }}>
          Tenta outras palavras ou limpa a pesquisa.
        </p>
      )}
    </div>
  );
}

// ─── Desktop row ─────────────────────────────────────────────────────────────

function DocRow({
  doc, selected, onClick,
}: {
  doc: ClubDocument;
  selected: boolean;
  onClick: () => void;
}) {
  const fresh = isNew(doc.updated_at);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3 transition-colors focus:outline-none"
      style={{
        background: selected ? "#ffffff" : "transparent",
        boxShadow:  selected ? "inset 0 0 0 1px #F5C9A6" : "none",
        borderBottom: "1px solid #F0ECE6",
      }}
    >
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: "1fr 120px 90px 64px" }}>
        {/* Documento */}
        <div className="flex items-start gap-3">
          <PdfIcon size={36} />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug" style={{ color: "#1C1915", wordBreak: "break-word" }}>
              {doc.title}
            </p>
            <p className="text-[11px] mt-0.5 font-mono" style={{ color: "#8F877C" }}>
              {doc.page_count ? `${doc.page_count} pág. · ` : ""}v{doc.version}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {fresh && (
                <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#F97316" }}>
                  Novo
                </span>
              )}
              {doc.required && (
                <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ border: "1px solid #F5C9A6", color: "#8A3A06" }}>
                  Obrigatório
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Categoria */}
        <p className="text-xs pt-0.5" style={{ color: "#5E574F" }}>
          {CAT_LABEL[doc.category as DocumentCategory] ?? doc.category}
        </p>
        {/* Atualizado */}
        <p className="text-xs pt-0.5 font-mono" style={{ color: "#8F877C" }}>
          {fmtDate(doc.updated_at)}
        </p>
        {/* Tamanho */}
        <p className="text-xs pt-0.5 font-mono text-right" style={{ color: "#8F877C" }}>
          {fmtSize(doc.file_size)}
        </p>
      </div>
    </button>
  );
}

// ─── Desktop preview panel ────────────────────────────────────────────────────

function DocPreview({
  doc, isAdmin, onEdit, onArchive,
}: {
  doc: ClubDocument | null;
  isAdmin: boolean;
  onEdit: (d: ClubDocument) => void;
  onArchive: (id: string) => void;
}) {
  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "#8F877C" }}>
        <p className="text-sm">Seleciona um documento</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full">
      {/* Miniatura / ícone */}
      <div
        className="shrink-0 flex items-center justify-center"
        style={{ height: 200, background: "#F3F0EB", borderBottom: "1px solid #ECE8E2" }}
      >
        <div className="flex flex-col items-center gap-2">
          <PdfIcon size={72} />
          <span className="text-xs font-mono" style={{ color: "#8F877C" }}>{fmtSize(doc.file_size)}</span>
        </div>
      </div>

      {/* Metadados */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <span
            className="inline-block text-[10px] font-bold uppercase tracking-wider font-mono mb-2"
            style={{ color: "#C2510C" }}
          >
            {CAT_LABEL[doc.category as DocumentCategory] ?? doc.category}
          </span>
          <h2 className="text-[19px] font-semibold leading-snug" style={{ color: "#1C1915" }}>
            {doc.title}
          </h2>
          {doc.summary && (
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "#5E574F" }}>{doc.summary}</p>
          )}
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Publicado por", value: doc.creator?.name ?? "—" },
            { label: "Atualizado",    value: fmtDate(doc.updated_at) },
            { label: "Páginas",       value: doc.page_count ? `${doc.page_count}` : "—" },
            { label: "Versão",        value: `v${doc.version}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg px-3 py-2" style={{ background: "#F3F0EB" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider font-mono" style={{ color: "#8F877C" }}>
                {label}
              </p>
              <p className="text-sm font-medium mt-0.5" style={{ color: "#1C1915" }}>{value}</p>
            </div>
          ))}
        </div>

        {doc.admin_note && (
          <div className="rounded-lg px-3 py-3" style={{ background: "#FFF1E6", border: "1px solid #F5C9A6" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider font-mono mb-1" style={{ color: "#C2510C" }}>
              Nota da direção
            </p>
            <p className="text-sm" style={{ color: "#4A443D" }}>{doc.admin_note}</p>
          </div>
        )}
      </div>

      {/* Botões */}
      <div className="shrink-0 border-t px-5 py-4 flex flex-col gap-2" style={{ borderColor: "#ECE8E2" }}>
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#F97316" }}
        >
          <ExternalLink className="h-4 w-4" />
          Abrir PDF
        </a>
        <a
          href={doc.file_url}
          download
          className="flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-colors hover:bg-black/5"
          style={{ border: "1px solid #E2DCD3", color: "#1C1915" }}
        >
          <Download className="h-4 w-4" />
          Descarregar
        </a>
        {isAdmin && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => onEdit(doc)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-colors hover:bg-black/5"
              style={{ border: "1px solid #E2DCD3", color: "#5E574F" }}
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
            <button
              type="button"
              onClick={() => onArchive(doc.id)}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-colors hover:bg-red-50"
              style={{ border: "1px solid #E2DCD3", color: "#C2510C" }}
            >
              <Archive className="h-3 w-3" /> Arquivar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function MobileDocCard({ doc, onClick }: { doc: ClubDocument; onClick: () => void }) {
  const fresh = isNew(doc.updated_at);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[.02] focus:outline-none"
      style={{ minHeight: 44, borderBottom: "1px solid #F0ECE6" }}
    >
      <PdfIcon size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium leading-snug" style={{ color: "#1C1915" }}>
          {doc.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[12px]" style={{ color: "#8F877C" }}>
            {fmtDate(doc.updated_at)}
          </span>
          {doc.required && (
            <span className="text-[11px] font-medium" style={{ color: "#C2510C" }}>· Obrigatório</span>
          )}
          {fresh && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#F97316" }}>
              Novo
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#C8C2BB" }} />
    </button>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function BottomSheet({
  doc, isAdmin, onClose, onEdit, onArchive,
}: {
  doc: ClubDocument;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (d: ClubDocument) => void;
  onArchive: (id: string) => void;
}) {
  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: doc.title, url: doc.file_url }); } catch {}
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(doc.file_url);
      toast({ title: "Link copiado" });
    }
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(28,25,21,.45)" }}
        onClick={onClose}
      />
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col bg-white"
        style={{ borderRadius: "20px 20px 0 0", paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "85dvh" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-black/15" />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-full hover:bg-black/5"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" style={{ color: "#8F877C" }} />
        </button>

        {/* Content scroll */}
        <div className="overflow-y-auto px-5 pb-2">
          <div className="flex gap-3 items-start mb-4 mt-2">
            <PdfIcon size={76} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider font-mono mb-1" style={{ color: "#C2510C" }}>
                {CAT_LABEL[doc.category as DocumentCategory] ?? doc.category}
              </p>
              <p className="text-[18px] font-semibold leading-snug" style={{ color: "#1C1915" }}>
                {doc.title}
              </p>
              <p className="text-[13px] mt-0.5 font-mono" style={{ color: "#8F877C" }}>
                {doc.page_count ? `${doc.page_count} pág. · ` : ""}
                {fmtSize(doc.file_size)} · v{doc.version}
              </p>
            </div>
          </div>

          {doc.summary && (
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#5E574F" }}>{doc.summary}</p>
          )}

          <p className="text-[12px]" style={{ color: "#8F877C" }}>
            Publicado por <strong>{doc.creator?.name ?? "—"}</strong> · {fmtDate(doc.updated_at)}
          </p>

          {doc.admin_note && (
            <div className="mt-3 rounded-xl px-3 py-3" style={{ background: "#FFF1E6", border: "1px solid #F5C9A6" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider font-mono mb-1" style={{ color: "#C2510C" }}>Nota da direção</p>
              <p className="text-sm" style={{ color: "#4A443D" }}>{doc.admin_note}</p>
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => { onClose(); onEdit(doc); }}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold transition-colors hover:bg-black/5"
                style={{ border: "1px solid #E2DCD3", color: "#5E574F" }}
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button
                type="button"
                onClick={() => { onClose(); onArchive(doc.id); }}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-semibold transition-colors hover:bg-red-50"
                style={{ border: "1px solid #E2DCD3", color: "#C2510C" }}
              >
                <Archive className="h-4 w-4" /> Arquivar
              </button>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="shrink-0 px-5 pb-5 pt-3 border-t flex flex-col gap-2" style={{ borderColor: "#ECE8E2" }}>
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-[52px] rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#F97316" }}
          >
            <ExternalLink className="h-4 w-4" /> Abrir PDF
          </a>
          <div className="flex gap-2">
            <a
              href={doc.file_url}
              download
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ border: "1px solid #E2DCD3", color: "#1C1915" }}
            >
              <Download className="h-4 w-4" /> Descarregar
            </a>
            <button
              type="button"
              onClick={share}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ border: "1px solid #E2DCD3", color: "#1C1915" }}
            >
              <Share2 className="h-4 w-4" /> Partilhar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Upload / Edit Modal ────────────────────────────────────────────────

interface UploadForm {
  title: string;
  category: DocumentCategory;
  season: string;
  summary: string;
  required: boolean;
  admin_note: string;
  file: File | null;
}

function AdminModal({
  open, editDoc, onClose, onSaved,
}: {
  open: boolean;
  editDoc: ClubDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<UploadForm>({
    title: "", category: "regulamentos", season: currentSeason(),
    summary: "", required: false, admin_note: "", file: null,
  });
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editDoc) {
      setForm({
        title:      editDoc.title,
        category:   editDoc.category as DocumentCategory,
        season:     editDoc.season,
        summary:    editDoc.summary ?? "",
        required:   editDoc.required,
        admin_note: editDoc.admin_note ?? "",
        file: null,
      });
    } else {
      setForm({ title: "", category: "regulamentos", season: currentSeason(), summary: "", required: false, admin_note: "", file: null });
    }
    setFileError("");
  }, [open, editDoc]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError("");
    if (f && f.type !== "application/pdf") {
      setFileError("Apenas PDFs são aceites.");
      return;
    }
    if (f && f.size > 20 * 1024 * 1024) {
      setFileError("Máximo 20 MB.");
      return;
    }
    setForm((p) => ({ ...p, file: f }));
  }

  async function submit() {
    if (!form.title.trim()) { toast({ title: "O título é obrigatório", variant: "destructive" }); return; }
    if (!form.season.trim()) { toast({ title: "A temporada é obrigatória", variant: "destructive" }); return; }
    if (!editDoc && !form.file) { toast({ title: "Seleciona um ficheiro PDF", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title",      form.title.trim());
      fd.append("category",   form.category);
      fd.append("season",     form.season.trim());
      fd.append("summary",    form.summary.trim());
      fd.append("required",   String(form.required));
      fd.append("admin_note", form.admin_note.trim());
      if (form.file) fd.append("file", form.file);

      const url    = editDoc ? `/api/documents/${editDoc.id}` : "/api/documents";
      const method = editDoc ? "PATCH" : "POST";
      const res    = await fetch(url, { method, body: fd });
      const json   = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");

      toast({ title: editDoc ? "Documento atualizado" : "Documento publicado" });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editDoc ? "Editar documento" : "Adicionar documento"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File */}
          <div>
            <Label htmlFor="doc-file">
              {editDoc ? "Substituir PDF (opcional)" : "Ficheiro PDF *"}
            </Label>
            <input
              ref={fileRef}
              id="doc-file"
              type="file"
              accept="application/pdf"
              className="mt-1 block w-full text-sm cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              onChange={handleFile}
            />
            {fileError && <p className="text-xs text-red-500 mt-1">{fileError}</p>}
            {form.file && <p className="text-xs text-muted-foreground mt-1">{form.file.name} · {fmtSize(form.file.size)}</p>}
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="doc-title">Título *</Label>
            <Input
              id="doc-title"
              className="mt-1"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="ex.: Regulamento Competição Sénior Masculina"
            />
          </div>

          {/* Category + Season row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="doc-cat">Categoria *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((p) => ({ ...p, category: v as DocumentCategory }))}
              >
                <SelectTrigger id="doc-cat" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="doc-season">Temporada *</Label>
              <Input
                id="doc-season"
                className="mt-1"
                value={form.season}
                onChange={(e) => setForm((p) => ({ ...p, season: e.target.value }))}
                placeholder="2026/27"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <Label htmlFor="doc-summary">Resumo</Label>
            <Textarea
              id="doc-summary"
              className="mt-1 resize-none"
              rows={2}
              value={form.summary}
              onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
              placeholder="Descrição curta do conteúdo (opcional)"
            />
          </div>

          {/* Admin note */}
          <div>
            <Label htmlFor="doc-note">Nota da direção</Label>
            <Input
              id="doc-note"
              className="mt-1"
              value={form.admin_note}
              onChange={(e) => setForm((p) => ({ ...p, admin_note: e.target.value }))}
              placeholder="ex.: Alterado o art. 14.º (opcional)"
            />
          </div>

          {/* Required */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="doc-required"
              checked={form.required}
              onCheckedChange={(v) => setForm((p) => ({ ...p, required: !!v }))}
            />
            <Label htmlFor="doc-required" className="cursor-pointer font-normal">
              Leitura obrigatória para todos os membros
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} style={{ background: "#F97316" }}>
            {saving ? "A guardar…" : editDoc ? "Guardar alterações" : "Publicar documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocumentosClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const q      = searchParams.get("q")   ?? "";
  const cat    = searchParams.get("cat") ?? "all";
  const docId  = searchParams.get("doc") ?? "";

  const [docs,    setDocs]    = useState<ClubDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Local search (debounced → URL)
  const [localQ, setLocalQ] = useState(q);

  // Mobile
  const [sheetDoc,  setSheetDoc]  = useState<ClubDocument | null>(null);

  // Admin modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc,   setEditDoc]   = useState<ClubDocument | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/documents");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setDocs(json.documents ?? []);
      setIsAdmin(!!json.isAdmin);
    } catch {
      toast({ title: "Erro ao carregar documentos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Debounce search → URL ─────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(searchParams.toString());
      if (localQ.trim()) p.set("q", localQ.trim()); else p.delete("q");
      router.replace(`?${p.toString()}`, { scroll: false });
    }, 150);
    return () => clearTimeout(t);
  }, [localQ, searchParams, router]);

  // ── URL helpers ───────────────────────────────────────────────────────────
  const setParam = useCallback((key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (value === null) p.delete(key); else p.set(key, value);
    router.replace(`?${p.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const active = docs.filter((d) => !d.archived_at);

  const filtered = useMemo(() => {
    let list = active;
    if (cat !== "all") list = list.filter((d) => d.category === cat);
    if (q.trim()) {
      const nq = normalise(q.trim());
      list = list.filter((d) =>
        normalise(d.title).includes(nq) ||
        normalise(CAT_LABEL[d.category as DocumentCategory] ?? "").includes(nq)
      );
    }
    return [...list].sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [active, cat, q]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>([["all", active.length]]);
    for (const d of active) map.set(d.category, (map.get(d.category) ?? 0) + 1);
    return map;
  }, [active]);

  const recentDocs = useMemo(
    () => active.filter((d) => isNew(d.updated_at))
             .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
             .slice(0, 5),
    [active]
  );

  const grouped = useMemo(() => {
    const map: Record<string, ClubDocument[]> = {};
    for (const d of filtered) {
      (map[d.category] ??= []).push(d);
    }
    return map;
  }, [filtered]);

  const seasons = useMemo(() => [...new Set(active.map((d) => d.season))].sort().reverse(), [active]);
  const seasonLabel = seasons[0] ?? currentSeason();

  const selectedDoc = useMemo(
    () => filtered.find((d) => d.id === docId) ?? filtered[0] ?? null,
    [filtered, docId]
  );

  // ── Keyboard nav (desktop) ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      const idx = filtered.findIndex((d) => d.id === (selectedDoc?.id ?? ""));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = filtered[Math.min(idx + 1, filtered.length - 1)];
        if (next) setParam("doc", next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = filtered[Math.max(idx - 1, 0)];
        if (prev) setParam("doc", prev.id);
      } else if (e.key === "Enter" && selectedDoc) {
        window.open(selectedDoc.file_url, "_blank");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, selectedDoc, setParam]);

  // ── Archive ───────────────────────────────────────────────────────────────
  async function archiveDoc(id: string) {
    if (!confirm("Arquivar este documento? Ficará oculto para os membros.")) return;
    const res  = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro", description: json.error, variant: "destructive" });
      return;
    }
    toast({ title: "Documento arquivado" });
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, archived_at: new Date().toISOString() } : d));
    if (selectedDoc?.id === id) setParam("doc", null);
  }

  function openEdit(doc: ClubDocument) {
    setEditDoc(doc);
    setModalOpen(true);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Full-height container ── */}
      <div
        className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 overflow-hidden"
        style={{ height: "calc(100dvh - 64px)" }}
      >

        {/* ═══════════════════ DESKTOP (≥ lg) ═══════════════════ */}
        <div
          className="hidden lg:grid h-full"
          style={{ gridTemplateColumns: "232px 1fr 340px" }}
        >
          {/* Left — Categories */}
          <div
            className="flex flex-col overflow-y-auto"
            style={{ borderRight: "1px solid #ECE8E2", background: "#FBFAF8" }}
          >
            <div className="px-4 pt-5 pb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest font-mono" style={{ color: "#8F877C" }}>
                Categorias
              </p>
            </div>

            <nav className="flex flex-col gap-0.5 px-2 pb-4">
              {([["all", "Todos"] as [string, string]]).concat(CATEGORIES.map((c) => [c, CAT_LABEL[c]])).map(([value, label]) => {
                const active2 = cat === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setParam("cat", value === "all" ? null : value)}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: active2 ? "#FFF1E6" : "transparent",
                      color:      active2 ? "#C2510C" : "#4A443D",
                      fontWeight: active2 ? 600 : 400,
                    }}
                  >
                    <span>{label}</span>
                    <span className="text-[11px] font-mono" style={{ color: active2 ? "#C2510C" : "#8F877C" }}>
                      {categoryCounts.get(value) ?? 0}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Info footer */}
            <div className="mt-auto mx-3 mb-4 rounded-xl px-3 py-3" style={{ background: "#F3F0EB" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#8F877C" }}>
                Documentos publicados pela direção. Visíveis para todos os membros do clube.
              </p>
            </div>
          </div>

          {/* Center — List */}
          <div className="flex flex-col overflow-hidden" style={{ borderRight: "1px solid #ECE8E2" }}>
            {/* List header */}
            <div className="shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: "1px solid #ECE8E2" }}>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: "-0.02em", color: "#1C1915" }}>
                    Documentos oficiais
                  </h1>
                  <p className="text-sm mt-0.5 font-mono" style={{ color: "#8F877C" }}>
                    Temporada {seasonLabel} · {filtered.length} documento{filtered.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative" style={{ width: 300 }}>
                    <Input
                      value={localQ}
                      onChange={(e) => setLocalQ(e.target.value)}
                      placeholder="Procurar documento…"
                      className="h-10 pl-3 pr-3 text-sm"
                      style={{ width: 300 }}
                    />
                  </div>
                  {isAdmin && (
                    <Button
                      onClick={() => { setEditDoc(null); setModalOpen(true); }}
                      size="sm"
                      className="h-10 gap-1.5"
                      style={{ background: "#F97316" }}
                    >
                      <Plus className="h-4 w-4" /> Adicionar
                    </Button>
                  )}
                </div>
              </div>

              {/* Column headers */}
              <div
                className="grid mt-3 px-4 text-[11px] font-bold uppercase tracking-widest font-mono"
                style={{ gridTemplateColumns: "1fr 120px 90px 64px", color: "#8F877C" }}
              >
                <span>Documento</span>
                <span>Categoria</span>
                <span>Atualizado</span>
                <span className="text-right">Tam.</span>
              </div>
            </div>

            {/* List scroll */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-0">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse" style={{ borderBottom: "1px solid #F0ECE6", background: i % 2 ? "#FBFAF8" : "white" }} />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState q={q} />
              ) : (
                filtered.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    selected={doc.id === selectedDoc?.id}
                    onClick={() => setParam("doc", doc.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right — Preview */}
          <div className="flex flex-col overflow-hidden bg-white">
            <DocPreview
              doc={selectedDoc}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onArchive={archiveDoc}
            />
          </div>
        </div>

        {/* ═══════════════════ MOBILE / TABLET (< lg) ═══════════════════ */}
        <div className="flex flex-col lg:hidden h-full">
          {/* Fixed header */}
          <div className="shrink-0 bg-white px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #ECE8E2" }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <p className="text-[13px]" style={{ color: "#8F877C" }}>Temporada {seasonLabel}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <h1 className="text-2xl font-semibold" style={{ letterSpacing: "-0.02em", color: "#1C1915" }}>
                    Documentos
                  </h1>
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full font-mono"
                    style={{ background: "#FFF1E6", color: "#C2510C" }}
                  >
                    {active.length} PDFs
                  </span>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => { setEditDoc(null); setModalOpen(true); }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-orange-50"
                  style={{ background: "#FFF1E6" }}
                  aria-label="Adicionar documento"
                >
                  <Plus className="h-5 w-5" style={{ color: "#F97316" }} />
                </button>
              )}
            </div>

            {/* Search */}
            <Input
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              placeholder="Procurar documento…"
              className="h-11 text-base"
              style={{ background: "#F3F0EB", border: "none", fontSize: 16 }}
            />

            {/* Category chips */}
            <div
              className="flex gap-2 mt-2 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {([["all", "Todos"] as [string, string]]).concat(CATEGORIES.map((c) => [c, CAT_SHORT[c as DocumentCategory]])).map(([value, label]) => {
                const isActive = cat === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setParam("cat", value === "all" ? null : value)}
                    className="shrink-0 text-[13px] font-semibold px-3 h-9 rounded-full transition-colors whitespace-nowrap"
                    style={{
                      background:  isActive ? "#1C1915" : "#ffffff",
                      color:       isActive ? "#ffffff" : "#4A443D",
                      border:      isActive ? "none" : "1px solid #E2DCD3",
                      minHeight:   36,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto" style={{ background: "#FBFAF8" }}>
            {loading ? (
              <div className="space-y-0 bg-white">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse" style={{ borderBottom: "1px solid #F0ECE6", background: i % 2 ? "#FBFAF8" : "white" }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState q={q} />
            ) : (
              <>
                {/* Recently added section */}
                {cat === "all" && !q.trim() && recentDocs.length > 0 && (
                  <div className="mb-4">
                    <p
                      className="px-4 pt-5 pb-2 text-[11px] font-bold uppercase tracking-widest font-mono"
                      style={{ color: "#8F877C" }}
                    >
                      Adicionados recentemente
                    </p>
                    <div className="mx-3 rounded-2xl overflow-hidden" style={{ background: "#1C1915" }}>
                      {recentDocs.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setSheetDoc(doc)}
                          className="w-full text-left flex items-center gap-3 px-4 py-3 transition-opacity hover:opacity-80 focus:outline-none"
                          style={{ borderBottom: "1px solid rgba(255,255,255,.07)", minHeight: 44 }}
                        >
                          <div
                            className="flex items-end justify-center rounded-md shrink-0"
                            style={{ width: 27, height: 36, background: "rgba(249,115,22,.2)", border: "1px solid rgba(249,115,22,.3)" }}
                          >
                            <span className="text-[8px] font-black pb-0.5 tracking-wide" style={{ color: "#F97316" }}>PDF</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium leading-snug text-white">{doc.title}</p>
                            <p className="text-[12px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,.45)" }}>
                              {fmtDate(doc.updated_at)}{doc.page_count ? ` · ${doc.page_count} pág.` : ""}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,.3)" }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grouped by category */}
                {Object.entries(grouped).map(([category, catDocs]) => (
                  <div key={category} className="mb-4">
                    <p className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-widest font-mono" style={{ color: "#8F877C" }}>
                      {CAT_LABEL[category as DocumentCategory] ?? category}
                    </p>
                    <div
                      className="mx-3 rounded-xl overflow-hidden bg-white"
                      style={{ border: "1px solid #ECE8E2" }}
                    >
                      {catDocs.map((doc) => (
                        <MobileDocCard key={doc.id} doc={doc} onClick={() => setSheetDoc(doc)} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Sheet ── */}
      {sheetDoc && (
        <BottomSheet
          doc={sheetDoc}
          isAdmin={isAdmin}
          onClose={() => setSheetDoc(null)}
          onEdit={openEdit}
          onArchive={archiveDoc}
        />
      )}

      {/* ── Admin Modal ── */}
      <AdminModal
        open={modalOpen}
        editDoc={editDoc}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </>
  );
}
