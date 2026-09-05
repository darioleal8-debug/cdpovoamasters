"use client";

import { useState } from "react";
import { MessageCircle, Search, Users } from "lucide-react";
import { EventThreadCard } from "./event-thread-card";
import { NewChatDialog } from "./new-chat-dialog";
import type { ChatThread, EventGameThread, EventTrainingThread, ChannelThread, DirectThread } from "@/types/database";
import type { AppUser } from "@/hooks/use-current-user";

// ── Helpers ───────────────────────────────────────────────────

function fmtRelTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) === today) {
    return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
  }
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) === yesterday) return "Ontem";
  const wd = d.toLocaleDateString("pt-PT", { weekday: "short", timeZone: "Europe/Lisbon" });
  return wd.charAt(0).toUpperCase() + wd.slice(1);
}

function initials(name: string): string {
  const p = name.trim().split(" ");
  return p.length > 1 ? `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

// ── Section label ─────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-5 pb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(169,180,199,.45)" }}>
      {children}
    </p>
  );
}

// ── Canal permanente (equipa, staff, comunicados) ─────────────
function ChannelRow({ thread, active, onClick }: { thread: ChannelThread; active: boolean; onClick: () => void }) {
  const ICONS: Record<string, React.ElementType> = { team: Users, staff: Users, announcement: Users, group: Users };
  const Icon = ICONS[thread.type] ?? MessageCircle;
  const preview = thread.last_message?.content ?? "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
      style={{
        background: active ? "rgba(249,115,22,.14)" : "transparent",
        border: `1px solid ${active ? "var(--action,#F97316)" : "transparent"}`,
      }}
    >
      <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-[12px] font-bold"
        style={{ background: "rgba(169,180,199,.1)", color: "#E6EBF3" }}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[13px] font-semibold truncate" style={{ color: "#E6EBF3" }}>
            {thread.name}
          </p>
          {thread.last_message && (
            <span className="shrink-0 text-[10px]" style={{ color: "rgba(169,180,199,.5)" }}>
              {fmtRelTime(thread.last_message.created_at)}
            </span>
          )}
        </div>
        <p className="text-[11px] truncate" style={{ color: "rgba(169,180,199,.6)" }}>{preview || "Sem mensagens"}</p>
      </div>
      {thread.unread_count > 0 && (
        <span className="h-5 min-w-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1 shrink-0"
          style={{ background: "var(--action,#F97316)", color: "#fff" }}>
          {thread.unread_count}
        </span>
      )}
    </button>
  );
}

// ── Direta ────────────────────────────────────────────────────
function DirectRow({ thread, active, onClick }: { thread: DirectThread; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
      style={{
        background: active ? "rgba(249,115,22,.14)" : "transparent",
        border: `1px solid ${active ? "var(--action,#F97316)" : "transparent"}`,
      }}
    >
      <div className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold"
        style={{ background: "rgba(169,180,199,.12)", color: "#E6EBF3" }}>
        {initials(thread.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[13px] font-semibold truncate" style={{ color: "#E6EBF3" }}>{thread.name}</p>
          {thread.last_message && (
            <span className="shrink-0 text-[10px]" style={{ color: "rgba(169,180,199,.5)" }}>
              {fmtRelTime(thread.last_message.created_at)}
            </span>
          )}
        </div>
        <p className="text-[11px] truncate" style={{ color: "rgba(169,180,199,.6)" }}>
          {thread.last_message?.content || "Sem mensagens"}
        </p>
      </div>
      {thread.unread_count > 0 && (
        <span className="h-5 min-w-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1 shrink-0"
          style={{ background: "var(--action,#F97316)", color: "#fff" }}>
          {thread.unread_count}
        </span>
      )}
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────
interface Props {
  currentUser:   AppUser | null;
  activeChatId:  string | null;
  onSelect:      (chatId: string) => void;
  threads:       ChatThread[];
  loading:       boolean;
  createDirect:  (targetUserId: string) => Promise<string | null>;
}

export function ThreadList({ currentUser, activeChatId, onSelect, threads, loading, createDirect }: Props) {
  const [search, setSearch]     = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const today  = new Date().toISOString().slice(0, 10);
  const week   = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const query = search.toLowerCase();

  function matchThread(t: ChatThread): boolean {
    if (!query) return true;
    if ("event_title" in t) return t.event_title.toLowerCase().includes(query);
    if ("name" in t && t.name) return t.name.toLowerCase().includes(query);
    return false;
  }

  const thisWeek    = threads.filter((t): t is EventGameThread | EventTrainingThread =>
    (t.type === "event_game" || t.type === "event_training") &&
    t.status === "active" &&
    "event_date" in t && t.event_date >= today && t.event_date <= week &&
    matchThread(t)
  );

  const upcoming    = threads.filter((t): t is EventGameThread | EventTrainingThread =>
    (t.type === "event_game" || t.type === "event_training") &&
    t.status === "active" &&
    "event_date" in t && t.event_date > week &&
    matchThread(t)
  );

  const permanent   = threads.filter((t): t is ChannelThread =>
    (t.type === "team" || t.type === "staff" || t.type === "announcement" || t.type === "group") &&
    matchThread(t)
  );

  const directs     = threads.filter((t): t is DirectThread =>
    t.type === "direct" && matchThread(t)
  );

  const archived    = threads.filter((t): t is EventGameThread | EventTrainingThread =>
    (t.type === "event_game" || t.type === "event_training") && t.status === "archived" && matchThread(t)
  );

  const totalUnread = threads.reduce((s, t) => s + t.unread_count, 0);

  return (
    <div
      className="flex h-full w-[340px] shrink-0 flex-col"
      style={{ background: "#0D1729", borderRight: "1px solid rgba(169,180,199,.08)" }}
    >
      {/* Header */}
      <div className="shrink-0 px-4 pt-5 pb-3">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-condensed font-bold text-xl uppercase tracking-display" style={{ color: "#E6EBF3" }}>
            Agenda e conversas
            {totalUnread > 0 && (
              <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full align-middle font-bold"
                style={{ background: "var(--action,#F97316)", color: "#fff" }}>
                {totalUnread}
              </span>
            )}
          </h2>
          {currentUser && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="h-8 px-2.5 rounded-lg text-[12px] font-semibold shrink-0 transition-colors"
            style={{ background: "rgba(249,115,22,.1)", color: "var(--action,#F97316)" }}
            aria-label="Nova conversa direta"
          >
            + Direta
          </button>
        )}
        </div>
        <p className="text-[11px]" style={{ color: "rgba(169,180,199,.5)" }}>
          Cada jogo e treino tem um fio próprio, aberto automaticamente.
        </p>

        {/* Pesquisa */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(169,180,199,.4)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar…"
            className="w-full h-9 rounded-xl pl-8 pr-3 text-[13px] outline-none"
            style={{
              background: "rgba(169,180,199,.06)",
              border: "1px solid rgba(169,180,199,.1)",
              color: "#E6EBF3",
            }}
          />
        </div>
      </div>

      {/* Lista com scroll */}
      <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "thin" }}>
        {loading && threads.length === 0 ? (
          <div className="flex flex-col gap-2 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "rgba(169,180,199,.06)" }} />
            ))}
          </div>
        ) : (
          <>
            {/* Esta semana */}
            {thisWeek.length > 0 && (
              <>
                <SectionLabel>Esta semana</SectionLabel>
                <div className="flex flex-col gap-1.5">
                  {thisWeek.map((t) => (
                    <EventThreadCard key={t.id} thread={t} active={t.id === activeChatId} onClick={() => onSelect(t.id)} />
                  ))}
                </div>
              </>
            )}

            {/* Próximos (fora desta semana) */}
            {upcoming.length > 0 && (
              <>
                <SectionLabel>Próximos</SectionLabel>
                <div className="flex flex-col gap-1.5">
                  {upcoming.map((t) => (
                    <EventThreadCard key={t.id} thread={t} active={t.id === activeChatId} onClick={() => onSelect(t.id)} />
                  ))}
                </div>
              </>
            )}

            {/* Permanentes */}
            {permanent.length > 0 && (
              <>
                <SectionLabel>Permanentes</SectionLabel>
                <div className="flex flex-col gap-0.5">
                  {permanent.map((t) => (
                    <ChannelRow key={t.id} thread={t} active={t.id === activeChatId} onClick={() => onSelect(t.id)} />
                  ))}
                </div>
              </>
            )}

            {/* Diretas */}
            {directs.length > 0 && (
              <>
                <SectionLabel>Diretas</SectionLabel>
                <div className="flex flex-col gap-0.5">
                  {directs.map((t) => (
                    <DirectRow key={t.id} thread={t} active={t.id === activeChatId} onClick={() => onSelect(t.id)} />
                  ))}
                </div>
              </>
            )}

            {/* Vazio com pesquisa ativa */}
            {query && thisWeek.length === 0 && upcoming.length === 0 && permanent.length === 0 && directs.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                <p className="text-[13px]" style={{ color: "rgba(169,180,199,.6)" }}>
                  Sem resultados para "{search}"
                </p>
              </div>
            )}

            {/* Vazio sem pesquisa */}
            {!query && thisWeek.length === 0 && upcoming.length === 0 && permanent.length === 0 && directs.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
                <p className="font-condensed font-bold text-lg uppercase" style={{ color: "rgba(169,180,199,.4)" }}>
                  Sem jogos ou treinos agendados
                </p>
                <p className="text-[12px]" style={{ color: "rgba(169,180,199,.35)" }}>
                  Agenda um evento para criar o fio automaticamente.
                </p>
                <a href="/jogos" className="text-[12px] font-semibold px-3 py-1.5 rounded-xl"
                  style={{ background: "rgba(249,115,22,.1)", color: "var(--action,#F97316)" }}>
                  Ir para Jogos
                </a>
              </div>
            )}

            {/* Arquivados */}
            {archived.length > 0 && (
              <>
                <SectionLabel>Arquivados</SectionLabel>
                <div className="flex flex-col gap-1.5">
                  {archived.map((t) => (
                    <EventThreadCard key={t.id} thread={t} active={t.id === activeChatId} onClick={() => onSelect(t.id)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {currentUser && (
        <NewChatDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          currentUser={currentUser}
          onCreateDirect={async (id) => {
            const chatId = await createDirect(id);
            if (chatId) { setDialogOpen(false); onSelect(chatId); }
          }}
          onCreateGroup={async () => {}}
        />
      )}
    </div>
  );
}
