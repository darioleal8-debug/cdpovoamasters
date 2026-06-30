"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { Megaphone, MessageCircle, Settings, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatMessages } from "@/hooks/use-chat-messages";
import { MessageBubble } from "./message-bubble";
import { Composer } from "./composer";
import { ChatSettingsDialog } from "./chat-settings-dialog";
import { canPostInChat, canManageChatPermissions } from "@/lib/chat/permissions";
import type { AppUser } from "@/hooks/use-current-user";
import type { ChatThreadSummary } from "@/types/database";

const TYPE_ICON = { direct: MessageCircle, group: Users, team: Users, announcement: Megaphone };

export function ChatWindow({
  thread,
  currentUser,
  onUpdatePostPolicy,
}: {
  thread: ChatThreadSummary;
  currentUser: AppUser;
  onUpdatePostPolicy: (chatId: string, postPolicy: "all" | "admin_only") => Promise<boolean>;
}) {
  const { messages, loading, hasMore, sending, send, loadOlder, markRead } = useChatMessages(thread.id);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nameCache = useRef(new Map<string, string>());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    for (const m of messages) {
      if (m.sender_name) nameCache.current.set(m.sender_id ?? "", m.sender_name);
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    markRead();
  }, [thread.id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const Icon = TYPE_ICON[thread.type];
  const canPost = thread.type === "direct" || canPostInChat(currentUser.role, thread.post_policy);
  const showSenderNames = thread.type !== "direct";
  const canManage = canManageChatPermissions(currentUser.role) && thread.type !== "direct" && thread.type !== "announcement";

  const resolvedMessages = useMemo(
    () =>
      messages.map((m) => ({
        ...m,
        sender_name:
          m.sender_name ?? (m.sender_id === currentUser.id ? currentUser.name : nameCache.current.get(m.sender_id ?? "") ?? null),
      })),
    [messages, currentUser]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="flex-1 font-semibold">{thread.name ?? "Conversa"}</p>
        {canManage && (
          <Button size="icon" variant="ghost" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-4 py-3">
        {hasMore && (
          <div className="mb-3 text-center">
            <Button variant="outline" size="sm" onClick={loadOlder}>Carregar mensagens anteriores</Button>
          </div>
        )}

        {loading && messages.length === 0 ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-2/3" />)}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Ainda não há mensagens. Diz olá!</p>
        ) : (
          <div className="space-y-3">
            {resolvedMessages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.sender_id === currentUser.id}
                showSenderName={showSenderNames && resolvedMessages[i - 1]?.sender_id !== m.sender_id}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      <Composer
        sending={sending}
        disabled={!canPost}
        disabledMessage={
          thread.type === "announcement"
            ? "Apenas administradores podem enviar comunicados."
            : "Esta conversa é só de leitura. Apenas administradores podem escrever."
        }
        onSend={send}
      />

      {canManage && (
        <ChatSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          thread={thread}
          onSave={onUpdatePostPolicy}
        />
      )}
    </div>
  );
}
