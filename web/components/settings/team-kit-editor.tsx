"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Label }      from "@/components/ui/label";
import { Separator }  from "@/components/ui/separator";
import { ColorPicker } from "@/components/settings/color-picker";
import { KitPreview }  from "@/components/settings/kit-preview";
import type { TeamKit } from "@/types/database";

interface Props {
  kit:       TeamKit;
  onSave:    (data: Partial<TeamKit>) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onReset?:  () => Promise<boolean>;
  readOnly?: boolean;
}

export function TeamKitEditor({ kit, onSave, onDelete, onReset, readOnly }: Props) {
  const [jerseyHome, setJerseyHome] = useState(kit.jersey_home_color);
  const [shortsHome, setShortsHome] = useState(kit.shorts_home_color);
  const [jerseyAway, setJerseyAway] = useState(kit.jersey_away_color);
  const [shortsAway, setShortsAway] = useState(kit.shorts_away_color);
  const [notes,      setNotes]      = useState(kit.notes ?? "");
  const [saving,     setSaving]     = useState(false);
  const [resetting,  setResetting]  = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const isDirty =
    jerseyHome !== kit.jersey_home_color ||
    shortsHome !== kit.shorts_home_color ||
    jerseyAway !== kit.jersey_away_color ||
    shortsAway !== kit.shorts_away_color ||
    notes      !== (kit.notes ?? "");

  async function handleSave() {
    setSaving(true);
    await onSave({
      jersey_home_color: jerseyHome,
      shorts_home_color: shortsHome,
      jersey_away_color: jerseyAway,
      shorts_away_color: shortsAway,
      notes: notes.trim() || null,
    });
    setSaving(false);
  }

  async function handleReset() {
    if (!onReset) return;
    setResetting(true);
    const ok = await onReset();
    if (ok) {
      setJerseyHome("#1e3a8a");
      setShortsHome("#1e3a8a");
      setJerseyAway("#ffffff");
      setShortsAway("#1e3a8a");
      setNotes("");
    }
    setResetting(false);
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return; }
    if (!onDelete) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  return (
    <div className="space-y-5">
      {/* Pré-visualização em tempo real */}
      <KitPreview
        jerseyHomeColor={jerseyHome}
        shortsHomeColor={shortsHome}
        jerseyAwayColor={jerseyAway}
        shortsAwayColor={shortsAway}
      />

      <Separator />

      {/* Equipamento Casa */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">Equipamento Casa</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ColorPicker
            label="Camisola"
            value={jerseyHome}
            onChange={setJerseyHome}
            disabled={readOnly}
          />
          <ColorPicker
            label="Calção"
            value={shortsHome}
            onChange={setShortsHome}
            disabled={readOnly}
          />
        </div>
      </div>

      <Separator />

      {/* Equipamento Fora */}
      <div>
        <h4 className="mb-3 text-sm font-semibold">Equipamento Fora</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ColorPicker
            label="Camisola"
            value={jerseyAway}
            onChange={setJerseyAway}
            disabled={readOnly}
          />
          <ColorPicker
            label="Calção"
            value={shortsAway}
            onChange={setShortsAway}
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Notas */}
      {!readOnly && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Alternativo amarelo usado em casos especiais..."
              disabled={readOnly}
            />
          </div>
        </>
      )}

      {/* Confirmação de eliminação */}
      {confirmDel && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">
            Confirmar eliminação do equipamento de <strong>{kit.team_name}</strong>?
            Esta ação é irreversível. Clica &quot;Eliminar&quot; novamente para confirmar.
          </p>
        </div>
      )}

      {/* Botões de ação */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>

          {onReset && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="gap-1.5"
            >
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Repor Padrão
            </Button>
          )}

          {onDelete && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={deleting}
              className={`ml-auto gap-1.5 ${confirmDel ? "border-red-500 text-red-600 hover:bg-red-50" : "text-red-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50"}`}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {confirmDel ? "Confirmar eliminação" : "Eliminar"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
