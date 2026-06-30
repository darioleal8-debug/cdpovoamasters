"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { ChatThreadMessage } from "@/types/database";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  message,
  isOwn,
  showSenderName,
}: {
  message: ChatThreadMessage;
  isOwn: boolean;
  showSenderName: boolean;
}) {
  const senderLabel = message.sender_name ?? "Utilizador";

  return (
    <div className={cn("flex items-end gap-2", isOwn && "flex-row-reverse")}>
      {!isOwn && (
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-[10px]">{initials(senderLabel)}</AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[70%] space-y-0.5", isOwn && "items-end")}>
        {showSenderName && !isOwn && (
          <p className="px-1 text-[11px] font-medium text-muted-foreground">{senderLabel}</p>
        )}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
            isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {message.attachment_url && (
            <p className="mt-1 truncate text-xs opacity-75">📎 anexo (disponível em breve)</p>
          )}
        </div>
        <p className={cn("px-1 text-[10px] text-muted-foreground", isOwn && "text-right")}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
