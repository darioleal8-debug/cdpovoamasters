"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  children: ReactNode[];
  initialCount?: number;
  label?: string;
}

export function TreinosPaginationWrapper({ children, initialCount = 5, label = "treinos" }: Props) {
  const [showAll, setShowAll] = useState(false);
  const total     = children.length;
  const visible   = showAll ? children : children.slice(0, initialCount);
  const remaining = total - initialCount;

  return (
    <>
      <div className="space-y-3">{visible}</div>
      {!showAll && remaining > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ChevronDown className="h-4 w-4" />
          Ver mais {remaining} {label}
        </button>
      )}
    </>
  );
}
