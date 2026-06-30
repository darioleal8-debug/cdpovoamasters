"use client";

import { useState, KeyboardEvent } from "react";
import { SendHorizonal, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function Composer({
  disabled,
  disabledMessage,
  sending,
  onSend,
}: {
  disabled?: boolean;
  disabledMessage?: string;
  sending: boolean;
  onSend: (content: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!value.trim() || sending) return;
    const content = value;
    setValue("");
    setError(null);
    try {
      await onSend(content);
    } catch (err) {
      setValue(content);
      setError(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  if (disabled) {
    return (
      <div className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
        {disabledMessage ?? "Não podes enviar mensagens nesta conversa."}
      </div>
    );
  }

  return (
    <div className="border-t p-3">
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreve uma mensagem..."
          rows={1}
          className="min-h-[40px] max-h-32 resize-none"
        />
        <Button size="icon" onClick={submit} disabled={!value.trim() || sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
