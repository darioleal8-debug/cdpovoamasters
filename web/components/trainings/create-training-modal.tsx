"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useGeolocation } from "@/hooks/use-geolocation";
import { googleMapsUrl } from "@/lib/geolocation";
import { TRAINING_TYPE_LABELS, type TrainingType, type RecurrenceType } from "@/types/database";

const DAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Props {
  open: boolean;
  onClose: () => void;
  seasonId: string;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}

export function CreateTrainingModal({ open, onClose, seasonId, onSubmit }: Props) {
  const [loading, setLoading] = useState(false);
  const { state: gps, capture: captureGps, reset: resetGps } = useGeolocation();
  const [form, setForm] = useState({
    date:            "",
    start_time:      "",
    end_time:        "",
    location:        "",
    type:            "geral" as TrainingType,
    notes:           "",
    recurrence_type: "unique" as RecurrenceType,
    day_of_week:     "1",
    day_of_month:    "1",
    end_date:        "",
  });

  function set(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const ok = await onSubmit({
      season_id:       seasonId,
      date:            form.date,
      start_time:      form.start_time,
      end_time:        form.end_time || undefined,
      location:        form.location,
      type:            form.type,
      notes:           form.notes || undefined,
      recurrence_type: form.recurrence_type,
      day_of_week:     form.recurrence_type === "weekly"  ? Number(form.day_of_week)  : undefined,
      day_of_month:    form.recurrence_type === "monthly" ? Number(form.day_of_month) : undefined,
      end_date:        form.end_date || undefined,
      location_lat:    gps.status === "ok" ? gps.location.lat : undefined,
      location_lng:    gps.status === "ok" ? gps.location.lng : undefined,
    });
    setLoading(false);
    if (ok) {
      resetGps();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Treino</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Data + Hora início + Hora fim */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data *</Label>
              <Input id="date" type="date" required value={form.date}
                onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start_time">Início *</Label>
              <Input id="start_time" type="time" required value={form.start_time}
                onChange={(e) => set("start_time", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_time">Fim</Label>
              <Input id="end_time" type="time" value={form.end_time}
                onChange={(e) => set("end_time", e.target.value)} />
            </div>
          </div>

          {/* Local */}
          <div className="space-y-1.5">
            <Label htmlFor="location">Local / Pavilhão *</Label>
            <Input
              id="location"
              required
              placeholder="Pavilhão Municipal da Póvoa de Varzim"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>

          {/* GPS para Auto-Presença */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              GPS para Auto-Presença
              <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </Label>

            {/* Botão — só aparece quando ainda não capturou */}
            {gps.status !== "ok" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={captureGps}
                disabled={gps.status === "loading"}
                className="flex items-center gap-1.5"
              >
                {gps.status === "loading" ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />A obter localização…</>
                ) : (
                  <><MapPin className="h-3.5 w-3.5" />📍 Localização Atual</>
                )}
              </Button>
            )}

            {/* Instrução */}
            {gps.status === "idle" && (
              <p className="text-[11px] text-muted-foreground/60 italic">
                Clica enquanto estiveres no pavilhão para guardar as coordenadas GPS.
                Os jogadores serão validados automaticamente quando registarem presença.
              </p>
            )}

            {/* Resultado OK */}
            {gps.status === "ok" && (
              <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-800 dark:bg-green-950/30">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-xs font-medium text-green-800 dark:text-green-200">
                    Localização capturada
                    {gps.location.accuracy <= 20 && (
                      <span className="ml-1.5 text-[10px] font-normal opacity-80">
                        (precisão: {Math.round(gps.location.accuracy)}m)
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-green-700 dark:text-green-400 font-mono">
                    {gps.location.lat.toFixed(6)}, {gps.location.lng.toFixed(6)}
                  </p>
                  <a
                    href={googleMapsUrl(gps.location.lat, gps.location.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-green-600 hover:underline dark:text-green-400"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver no Google Maps
                  </a>
                </div>
                <button
                  type="button"
                  onClick={resetGps}
                  className="text-xs text-green-600 hover:text-green-900 dark:hover:text-green-200 shrink-0"
                >
                  Limpar
                </button>
              </div>
            )}

            {/* Erro */}
            {gps.status === "error" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/30 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{gps.message}</p>
                  </div>
                  {gps.geoCode === 1 ? (
                    <button type="button" onClick={resetGps} className="text-xs text-amber-600 hover:text-amber-900 shrink-0">
                      Fechar
                    </button>
                  ) : (
                    <button type="button" onClick={captureGps} className="text-xs text-amber-600 hover:text-amber-900 shrink-0">
                      Tentar novamente
                    </button>
                  )}
                </div>
                {gps.geoCode === 1 && (
                  <ol className="text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5 pl-1 list-decimal list-inside">
                    <li><strong>Chrome / Edge:</strong> clica no 🔒 ou ℹ️ na barra de endereço → <em>Permissões do site</em> → Localização → <strong>Permitir</strong></li>
                    <li><strong>Firefox:</strong> clica no ícone de escudo ou 🔒 → <em>Ligar proteção</em> ou permissão de localização → <strong>Permitir</strong></li>
                    <li>Recarrega a página e clica de novo em <em>📍 Localização Atual</em></li>
                  </ol>
                )}
                {gps.geoCode === 1 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 italic">
                    O GPS é opcional — podes criar o treino sem ele; o treinador valida as presenças manualmente.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo de Treino</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRAINING_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Periodicidade */}
          <div className="space-y-1.5">
            <Label>Periodicidade</Label>
            <Select value={form.recurrence_type} onValueChange={(v) => set("recurrence_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unique">Único (sem repetição)</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.recurrence_type === "weekly" && (
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Select value={form.day_of_week} onValueChange={(v) => set("day_of_week", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS_PT.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.recurrence_type === "monthly" && (
            <div className="space-y-1.5">
              <Label>Dia do mês</Label>
              <Select value={form.day_of_month} onValueChange={(v) => set("day_of_month", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>Dia {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.recurrence_type !== "unique" && (
            <div className="space-y-1.5">
              <Label htmlFor="end_date">Data de fim da recorrência</Label>
              <Input id="end_date" type="date" value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Deixar vazio para usar o fim da temporada
              </p>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas / Comentários</Label>
            <textarea
              id="notes"
              className="w-full min-h-[70px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Observações gerais sobre o treino..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "A criar..." : "Criar Treino"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
