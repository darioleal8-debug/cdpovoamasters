"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useChatThreads } from "@/hooks/use-chat-threads";
import { ThreadList } from "./thread-list";
import { ChatWindow } from "./chat-window";

export function ChatLayout() {
  const { user, loading: userLoading } = useCurrentUser();
  const { threads, loading: threadsLoading, createDirect, createGroup, updatePostPolicy } = useChatThreads();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const activeThread = threads.find((t) => t.id === activeChatId) ?? null;

  if (userLoading || !user) {
    return (
      <div className="flex h-[calc(100vh-7rem)] gap-4">
        <Skeleton className="h-full w-80" />
        <Skeleton className="h-full flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-background">
      <div className="w-80 shrink-0">
        <ThreadList
          currentUser={user}
          activeChatId={activeChatId}
          onSelect={setActiveChatId}
          threads={threads}
          loading={threadsLoading}
          createDirect={createDirect}
          createGroup={createGroup}
        />
      </div>
      <div className="flex-1">
        {activeThread ? (
          <ChatWindow thread={activeThread} currentUser={user} onUpdatePostPolicy={updatePostPolicy} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-10 w-10" />
            <p className="text-sm">Seleciona uma conversa para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
