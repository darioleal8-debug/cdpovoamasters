"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { pt } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { PushPrompt } from "@/components/push/push-prompt";
import { AnnouncementComposer } from "./announcement-composer";
import { targetLabel } from "@/lib/announcements/format";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX, type AnnouncementDTO } from "@/lib/announcements/types";
import { ANNOUNCEMENTS_CHANGED } from "@/hooks/use-unread-announcements";

interface ListResponse {
  announcements: AnnouncementDTO[];
  has_more: boolean;
  can_post: boolean;
  is_player: boolean;
  me: string;
  is_admin: boolean;
}

const POLL_MS = 60_000;
const changed = () => window.dispatchEvent(new Event(ANNOUNCEMENTS_CHANGED));

function Card({ a, canManage, onChanged }: { a: AnnouncementDTO; canManage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(a.title);
  const [body, setBody] = useState(a.body);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/announcements/${a.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body }),
    });
    setBusy(false);
    if (!res.ok) { toast({ title: "Não foi possível guardar", variant: "destructive" }); return; }
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!window.confirm("Apagar este comunicado? Deixa de aparecer a todos.")) return;
    setBusy(true);
    const res = await fetch(`/api/announcements/${a.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { toast({ title: "Não foi possível apagar", variant: "destructive" }); return; }
    onChanged();
  }

  return (
    <article
      className="rounded-2xl p-4 sm:p-5 flex flex-col gap-2"
      style={{
        background: "var(--paper,#F6F7F9)",
        border: `1px solid ${a.highlighted ? "rgba(249,115,22,.4)" : "var(--line,#E4E7EE)"}`,
        borderLeft: a.highlighted ? "4px solid var(--action,#F97316)" : undefined,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.unread && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: "var(--action,#F97316)" }}>Novo</span>
        )}
        {a.target && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(20,33,61,.08)", color: "var(--text,#0A1220)" }}>
            {targetLabel(a.target)}
          </span>
        )}
        {a.target_removed && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(20,33,61,.08)", color: "var(--muted-text,#5A6478)" }}>
            Jogo/treino cancelado
          </span>
        )}
        {a.highlighted && (
          <span className="text-[11px] font-semibold" style={{ color: "var(--action,#F97316)" }}>Em destaque</span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ANNOUNCEMENT_TITLE_MAX} aria-label="Título" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={ANNOUNCEMENT_BODY_MAX} rows={5} aria-label="Texto" />
          <p className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>Corrigir o texto não volta a notificar os jogadores.</p>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy || !title.trim() || !body.trim()}
              className="h-9 rounded-lg px-4 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: "var(--action,#F97316)" }}>
              {busy ? "A guardar…" : "Guardar"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setTitle(a.title); setBody(a.body); }} disabled={busy}
              className="h-9 rounded-lg px-3 text-[13px] font-semibold" style={{ color: "var(--muted-text,#5A6478)" }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-[16px] font-bold leading-snug" style={{ color: "var(--text,#0A1220)" }}>{a.title}</h2>
          <p className="whitespace-pre-line text-[14px] leading-relaxed" style={{ color: "var(--text,#0A1220)" }}>{a.body}</p>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px]" style={{ color: "var(--muted-text,#5A6478)" }}>
          {a.author?.name ?? "Equipa"} · há {formatDistanceToNowStrict(new Date(a.created_at), { locale: pt })}
        </p>
        {canManage && !editing && (
          <div className="flex gap-1">
            <button type="button" onClick={() => setEditing(true)} disabled={busy} aria-label="Editar comunicado"
              className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: "var(--muted-text,#5A6478)" }}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" onClick={remove} disabled={busy} aria-label="Apagar comunicado"
              className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: "var(--muted-text,#5A6478)" }}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/** Página de Comunicados (substitui o chat): lista para todos; formulário só para admin e treinador. */
export function AnnouncementsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [extra, setExtra] = useState<AnnouncementDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const markedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/announcements?limit=30", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as ListResponse;
      setData(d);
      setExtra([]);
      setHasMore(d.has_more);
      setFailed(false);
      // Ao abrir a página, tudo o que está à vista passa a visto (o "Novo" mantém-se até sair da página)
      if (!markedRef.current && d.announcements.some((a) => a.unread)) {
        markedRef.current = true;
        fetch("/api/announcements/read", { method: "POST" }).then(changed).catch(() => {});
      }
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function loadMore() {
    if (!data) return;
    const all = [...data.announcements, ...extra];
    const last = all[all.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/announcements?limit=30&before=${encodeURIComponent(last.created_at)}`, { cache: "no-store" });
      if (res.ok) {
        const d = (await res.json()) as ListResponse;
        setExtra((prev) => [...prev, ...d.announcements]);
        setHasMore(d.has_more);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const refresh = () => { void load(); changed(); };

  if (failed && !data) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ border: "1px solid var(--line,#E4E7EE)" }}>
        <p className="text-sm font-semibold">Não foi possível carregar os comunicados.</p>
        <button type="button" onClick={() => void load()} className="mt-3 h-9 rounded-lg px-4 text-[13px] font-bold text-white" style={{ background: "var(--action,#F97316)" }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 animate-pulse" aria-busy="true">
        <div className="h-8 w-48 rounded-xl bg-black/5" />
        {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-black/5" />)}
      </div>
    );
  }

  const items = [...data.announcements, ...extra];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 font-condensed text-2xl font-bold" style={{ color: "var(--text,#0A1220)" }}>
          <Megaphone className="h-6 w-6" style={{ color: "var(--action,#F97316)" }} aria-hidden /> Comunicados
        </h1>
        <p className="text-[13px]" style={{ color: "var(--muted-text,#5A6478)" }}>
          Avisos da direção e do treinador. Só eles podem publicar.
        </p>
      </div>

      {data.is_player && <PushPrompt showDenied />}

      {data.can_post && <AnnouncementComposer onPublished={refresh} />}

      {items.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ border: "1px dashed var(--line,#E4E7EE)" }}>
          <p className="text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>Ainda não há comunicados.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((a) => (
            <Card
              key={a.id} a={a} onChanged={refresh}
              canManage={data.can_post && (data.is_admin || a.author?.id === data.me)}
            />
          ))}
          {hasMore && (
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="h-10 self-center rounded-lg px-5 text-[13px] font-semibold" style={{ border: "1px solid var(--line,#E4E7EE)", color: "var(--text,#0A1220)" }}>
              {loadingMore ? "A carregar…" : "Ver mais antigos"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
