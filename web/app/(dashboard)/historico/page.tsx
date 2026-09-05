"use client";

import { useState } from "react";
import { Upload, Users, Calendar } from "lucide-react";
import { ImportWizard } from "@/components/historico/import-wizard";
import { PlayerHistoryTable } from "@/components/historico/player-history-table";
import { GameHistoryTable } from "@/components/historico/game-history-table";

const TABS = [
  { id: "importar",  label: "Importar",            icon: Upload   },
  { id: "jogadores", label: "Histórico Jogadores",  icon: Users    },
  { id: "jogos",     label: "Histórico Jogos",      icon: Calendar },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function HistoricoPage() {
  const [tab,       setTab]       = useState<TabId>("importar");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Histórico de Estatísticas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Importa e consulta estatísticas de temporadas anteriores
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => {
          const Icon    = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "importar" && (
        <ImportWizard
          key={refreshKey}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {tab === "jogadores" && <PlayerHistoryTable key={refreshKey} />}
      {tab === "jogos"     && <GameHistoryTable   key={refreshKey} />}
    </div>
  );
}
