"use client";

import { useState } from "react";
import { Lock, Megaphone, MessageCircle, Plus, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NewChatDialog } from "./new-chat-dialog";
import type { AppUser } from "@/hooks/use-current-user";
import type { ChatThreadSummary } from "@/types/database";

const TYPE_ICON = { direct: MessageCircle, group: Users, team: Users, announcement: Megaphone };

function formatPreviewTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export function ThreadList({
  currentUser,
  activeChatId,
  onSelect,
  threads,
  loading,
  createDirect,
  createGroup,
}: {
  currentUser: AppUser;
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  threads: ChatThreadSummary[];
  loading: boolean;
  createDirect: (targetUserId: string) => Promise<string | null>;
  createGroup: (name: string, participantIds: string[], postPolicy: "all" | "admin_only") => Promise<string | null>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleCreated(chatId: string) {
    setDialogOpen(false);
    onSelect(chatId);
  }

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-semibold">Conversas</p>
        <Button size="icon" variant="ghost" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading && threads.length === 0 ? (
          <div className="space-y-2 p-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : threads.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Sem conversas ainda.</p>
        ) : (
          <div className="space-y-0.5 p-2">
            {threads.map((t) => (
              <ThreadRow key={t.id} thread={t} active={t.id === activeChatId} onClick={() => onSelect(t.id)} />
            ))}
          </div>
        )}
      </ScrollArea>

      <NewChatDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        currentUser={currentUser}
        onCreateDirect={async (id) => { const chatId = await createDirect(id); if (chatId) handleCreated(chatId); }}
        onCreateGroup={async (name, ids, postPolicy) => { const chatId = await createGroup(name, ids, postPolicy); if (chatId) handleCreated(chatId); }}
      />
    </div>
  );
}

function ThreadRow({ thread, active, onClick }: { thread: ChatThreadSummary; active: boolean; onClick: () => void }) {
  const Icon = TYPE_ICON[thread.type];
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 truncate text-sm font-medium">
            <span className="truncate">{thread.name ?? "Conversa"}</span>
            {thread.post_policy === "admin_only" && thread.type !== "announcement" && (
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </p>
          {thread.last_message && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatPreviewTime(thread.last_message.created_at)}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {thread.last_message?.content ?? "Sem mensagens"}
        </p>
      </div>
      {thread.unread_count > 0 && (
        <Badge className="shrink-0 px-1.5 py-0">{thread.unread_count}</Badge>
      )}
    </button>
  );
}
