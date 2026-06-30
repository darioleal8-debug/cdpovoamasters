"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function PlayerChatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[chat] client exception:", error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col items-center justify-center gap-3 rounded-lg border bg-background p-6 text-center">
      <p className="font-semibold text-destructive">Erro no chat interno</p>
      <p className="max-w-xl text-sm text-muted-foreground">{error.message || "Erro desconhecido"}</p>
      {error.digest && <p className="text-xs text-muted-foreground">digest: {error.digest}</p>}
      <pre className="max-w-2xl overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-left text-xs">
        {error.stack}
      </pre>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
