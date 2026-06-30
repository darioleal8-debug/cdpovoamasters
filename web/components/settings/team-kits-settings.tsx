"use client";

import { useState } from "react";
import { Plus, Loader2, ChevronDown, ChevronUp, Shirt } from "lucide-react";
import { Button }       from "@/components/ui/button";
import { Input }        from "@/components/ui/input";
import { Label }        from "@/components/ui/label";
import { Skeleton }     from "@/components/ui/skeleton";
import { TeamKitEditor } from "@/components/settings/team-kit-editor";
import { KitSwatch }     from "@/components/settings/kit-preview";
import { useTeamKits }   from "@/hooks/use-team-kits";
import { useClubSettings } from "@/lib/club-context";
import type { TeamKit }  from "@/types/database";

function buildSavePayload(kit: TeamKit, data: Partial<TeamKit>) {
  return {
    id:                kit.id,
    team_name:         kit.team_name,
    jersey_home_color: data.jersey_home_color ?? kit.jersey_home_color,
    shorts_home_color: data.shorts_home_color ?? kit.shorts_home_color,
    jersey_away_color: data.jersey_away_color ?? kit.jersey_away_color,
    shorts_away_color: data.shorts_away_color ?? kit.shorts_away_color,
    notes:             data.notes ?? kit.notes,
  };
}

export function TeamKitsSettings() {
  const { settings }                              = useClubSettings();
  const { kits, loading, saveKit, deleteKit, resetKit } = useTeamKits();

  // Expandir/colapsar cada equipa
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  function toggle(id: string) { setExpanded((p) => ({ ...p, [id]: !p[id] })); }

  // Formulário: adicionar nova equipa
  const [addOpen,      setAddOpen]      = useState(false);
  const [newTeamName,  setNewTeamName]  = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    const ok = await saveKit({
      team_name:         newTeamName.trim(),
      jersey_home_color: "#1e3a8a",
      shorts_home_color: "#1e3a8a",
      jersey_away_color: "#ffffff",
      shorts_away_color: "#1e3a8a",
    });
    setCreatingTeam(false);
    if (ok) { setNewTeamName(""); setAddOpen(false); }
  }

  // Separar: o nosso clube vs. equipas adversárias
  const ourName   = settings.club_name.toLowerCase();
  const ourKit    = kits.find((k) => k.team_name.toLowerCase() === ourName) ?? kits[0] ?? null;
  const otherKits = kits.filter((k) => k.team_name.toLowerCase() !== ourName);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Nosso clube ──────────────────────────────── */}
      {ourKit && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Shirt className="h-4 w-4 text-cdpovoa-blue" />
            {settings.club_name}
            <span className="ml-auto rounded-full bg-cdpovoa-blue/10 px-2 py-0.5 text-[11px] font-semibold text-cdpovoa-blue">
              Nosso Clube
            </span>
          </h3>
          <TeamKitEditor
            kit={ourKit}
            onSave={(data) => saveKit(buildSavePayload(ourKit, data))}
            onReset={() => resetKit(ourKit.id)}
          />
        </div>
      )}

      {/* ── Equipas adversárias ────────────────────── */}
      {(otherKits.length > 0 || addOpen) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Equipas Adversárias
          </h3>

          {otherKits.map((kit) => (
            <div key={kit.id} className="rounded-lg border overflow-hidden">
              {/* Cabeçalho colapsável */}
              <button
                type="button"
                onClick={() => toggle(kit.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              >
                <KitSwatch jerseyColor={kit.jersey_home_color} shortsColor={kit.shorts_home_color} size="sm" title="Casa" />
                <span className="text-sm font-medium flex-1 truncate">{kit.team_name}</span>
                <KitSwatch jerseyColor={kit.jersey_away_color} shortsColor={kit.shorts_away_color} size="sm" title="Fora" />
                {expanded[kit.id]
                  ? <ChevronUp   className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>

              {expanded[kit.id] && (
                <div className="border-t p-4">
                  <TeamKitEditor
                    kit={kit}
                    onSave={(data) => saveKit(buildSavePayload(kit, data))}
                    onDelete={() => deleteKit(kit.id)}
                    onReset={() => resetKit(kit.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Adicionar nova equipa ─────────────────── */}
      {addOpen ? (
        <form onSubmit={handleCreateTeam} className="rounded-lg border border-dashed p-4 space-y-3">
          <Label htmlFor="new-team">Nome da Equipa *</Label>
          <div className="flex gap-2">
            <Input
              id="new-team"
              autoFocus
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Ex: SC Braga Basketball"
              className="flex-1"
              required
            />
            <Button type="submit" disabled={creatingTeam || !newTeamName.trim()}>
              {creatingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setAddOpen(false); setNewTeamName(""); }}>
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O nome deve corresponder exatamente ao que aparece no calendário da liga.
          </p>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 border-dashed"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Adicionar equipa adversária
        </Button>
      )}
    </div>
  );
}
