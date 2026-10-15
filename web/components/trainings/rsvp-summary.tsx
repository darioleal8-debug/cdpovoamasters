"use client";

import { Check, X, HelpCircle, AlertTriangle } from "lucide-react";
import type { TrainingRsvpSummary } from "@/types/database";

interface Props {
  summary: TrainingRsvpSummary;
  showAlert?: boolean;
}

export function RsvpSummary({ summary, showAlert = false }: Props) {
  const { going_count, not_going_count, no_response_count, min_players } = summary;
  const belowMin = showAlert && going_count < min_players;

  return (
    <div className="flex items-center gap-3 flex-wrap text-xs">
      <span className="flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
        <Check className="h-3.5 w-3.5" />
        {going_count} vão
      </span>
      <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
        <X className="h-3.5 w-3.5" />
        {not_going_count} não vão
      </span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5" />
        {no_response_count} sem resposta
      </span>
      {belowMin && (
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
          <AlertTriangle className="h-3.5 w-3.5" />
          Mínimo de {min_players} não atingido
        </span>
      )}
    </div>
  );
}
