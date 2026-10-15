"use client";

import { Share2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  eventId: string;
  title?: string;
  className?: string;
  label?: string;
}

export function ShareButton({
  eventId,
  title = "Confirma a tua disponibilidade",
  className,
  label = "Copiar link",
}: ShareButtonProps) {
  async function handleShare() {
    const url = `${window.location.origin}/e/${eventId}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado!" });
    } catch {
      toast({ title: "Não foi possível copiar o link", variant: "destructive" });
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleShare}
      className={className ?? "h-8 gap-1 px-2"}
    >
      <Share2 className="h-3.5 w-3.5" />
      <span className="hidden sm:inline text-xs">{label}</span>
    </Button>
  );
}
