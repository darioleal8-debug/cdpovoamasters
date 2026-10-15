"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/components/ui/toaster";

interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  published_at: string;
  is_published: boolean;
  is_featured: boolean;
}

const EMPTY_FORM: Omit<Article, "id"> = {
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  category: "Regras",
  published_at: new Date().toISOString().slice(0, 16),
  is_published: false,
  is_featured: false,
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function NoticiasAdminPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Omit<Article, "id">>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/news");
      if (!res.ok) throw new Error("Sem permissão");
      const { articles: data } = await res.json();
      setArticles(data ?? []);
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro ao carregar notícias", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startNew() {
    setForm({ ...EMPTY_FORM, published_at: new Date().toISOString().slice(0, 16) });
    setEditingId("new");
  }

  function startEdit(a: Article) {
    setForm({
      slug: a.slug,
      title: a.title,
      excerpt: a.excerpt,
      body: a.body,
      category: a.category,
      published_at: a.published_at.slice(0, 16),
      is_published: a.is_published,
      is_featured: a.is_featured,
    });
    setEditingId(a.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.title || !form.slug || !form.excerpt) {
      toast({ title: "Preenche título, slug e resumo", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const isNew = editingId === "new";
      const url = isNew ? "/api/admin/news" : `/api/admin/news/${editingId}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, published_at: new Date(form.published_at).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao guardar");
      toast({ title: isNew ? "Notícia criada" : "Notícia atualizada" });
      cancelEdit();
      load();
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro ao guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(a: Article) {
    try {
      const res = await fetch(`/api/admin/news/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: !a.is_published }),
      });
      if (!res.ok) throw new Error("Erro");
      toast({ title: a.is_published ? "Despublicada" : "Publicada" });
      load();
    } catch {
      toast({ title: "Erro ao alterar estado", variant: "destructive" });
    }
  }

  async function handleDelete(a: Article) {
    if (!confirm(`Apagar "${a.title}"? Esta ação é irreversível.`)) return;
    try {
      const res = await fetch(`/api/admin/news/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro");
      toast({ title: "Notícia apagada" });
      load();
    } catch {
      toast({ title: "Erro ao apagar", variant: "destructive" });
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--line,#E4E7EE)",
    fontSize: 14,
    background: "var(--base,#fff)",
    color: "var(--ink,#0A1220)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted-text,#5A6478)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1
          className="font-condensed font-bold text-2xl uppercase tracking-display"
          style={{ color: "var(--ink,#0A1220)" }}
        >
          Gestão de Notícias
        </h1>
        {editingId === null && (
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: "var(--action,#F97316)", color: "#fff" }}
          >
            + Nova notícia
          </button>
        )}
      </div>

      {/* Form */}
      {editingId !== null && (
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--ink,#0A1220)" }}>
            {editingId === "new" ? "Nova notícia" : "Editar notícia"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Título *</label>
              <input
                style={inputStyle}
                value={form.title}
                onChange={(e) => {
                  const t = e.target.value;
                  setForm((f) => ({
                    ...f,
                    title: t,
                    slug: editingId === "new" ? slugify(t) : f.slug,
                  }));
                }}
                placeholder="Título do artigo"
              />
            </div>
            <div>
              <label style={labelStyle}>Slug *</label>
              <input
                style={inputStyle}
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                placeholder="url-do-artigo"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Resumo *</label>
            <textarea
              style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
              value={form.excerpt}
              onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
              placeholder="Uma frase que resume o artigo"
            />
          </div>

          <div>
            <label style={labelStyle}>Corpo (Markdown)</label>
            <textarea
              style={{ ...inputStyle, minHeight: 240, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 13 }}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="## Título&#10;&#10;Texto em **Markdown**..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label style={labelStyle}>Categoria</label>
              <select
                style={inputStyle}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {["Regras", "Competições", "Clube", "Formação", "Geral"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Data de publicação</label>
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.published_at}
                onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                />
                <span className="text-sm font-medium" style={{ color: "var(--ink,#0A1220)" }}>Publicado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                />
                <span className="text-sm font-medium" style={{ color: "var(--ink,#0A1220)" }}>Destaque</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ background: "var(--action,#F97316)", color: "#fff" }}
            >
              {saving ? "A guardar…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: "var(--line,#E4E7EE)", color: "var(--ink,#0A1220)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>A carregar…</p>
      ) : articles.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
        >
          <p className="text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>
            Sem notícias. Clica em <strong>+ Nova notícia</strong> para começar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-4 rounded-xl p-4"
              style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: a.is_published ? "#DCFCE7" : "var(--line,#E4E7EE)",
                      color: a.is_published ? "#15803D" : "var(--muted-text,#5A6478)",
                    }}
                  >
                    {a.is_published ? "Publicado" : "Rascunho"}
                  </span>
                  {a.is_featured && (
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: "#FFF7ED", color: "#B26016" }}
                    >
                      Destaque
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>
                    {a.category} · {fmtDate(a.published_at)}
                  </span>
                </div>
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--ink,#0A1220)" }}
                >
                  {a.title}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(a)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "var(--line,#E4E7EE)", color: "var(--ink,#0A1220)" }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => togglePublish(a)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{
                    background: a.is_published ? "#FEF3C7" : "#DCFCE7",
                    color: a.is_published ? "#92400E" : "#15803D",
                  }}
                >
                  {a.is_published ? "Despublicar" : "Publicar"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "#FEE2E2", color: "#B91C1C" }}
                >
                  Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-4">
        <a
          href="/noticias"
          target="_blank"
          rel="noopener"
          className="text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--action,#F97316)" }}
        >
          Ver página pública de notícias →
        </a>
      </div>
    </div>
  );
}
