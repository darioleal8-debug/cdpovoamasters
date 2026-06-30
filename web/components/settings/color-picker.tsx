"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn }   from "@/lib/utils";

// Paleta de cores sugeridas para equipamentos desportivos
const PRESETS = [
  "#1e3a8a", // azul escuro
  "#1d4ed8", // azul médio
  "#dc2626", // vermelho
  "#16a34a", // verde
  "#ca8a04", // amarelo/ouro
  "#9333ea", // roxo
  "#ea580c", // laranja
  "#0e7490", // petróleo
  "#1f2937", // preto
  "#6b7280", // cinzento
  "#f1f5f9", // branco quase
  "#ffffff", // branco puro
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

interface Props {
  value:    string;
  onChange: (color: string) => void;
  label?:   string;
  disabled?: boolean;
}

export function ColorPicker({ value, onChange, label, disabled }: Props) {
  const [hex,   setHex]   = useState(value);
  const [error, setError] = useState(false);
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setHex(value); setError(false); }, [value]);

  function handleNative(e: ChangeEvent<HTMLInputElement>) {
    const c = e.target.value;
    setHex(c);
    setError(false);
    onChange(c);
  }

  function handleText(e: ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;
    if (raw && !raw.startsWith("#")) raw = "#" + raw;
    setHex(raw);
    if (HEX_RE.test(raw)) {
      setError(false);
      onChange(raw);
    } else {
      setError(true);
    }
  }

  function handlePreset(c: string) {
    setHex(c);
    setError(false);
    onChange(c);
  }

  const displayColor = HEX_RE.test(hex) ? hex : value;

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs font-medium">{label}</Label>}

      {/* Seletor principal */}
      <div className="flex items-center gap-2">
        {/* Círculo de cor clicável que abre o native picker */}
        <button
          type="button"
          disabled={disabled}
          title="Abrir palete de cores"
          onClick={() => nativeRef.current?.click()}
          className={cn(
            "relative h-9 w-9 shrink-0 rounded-lg border-2 shadow-sm transition-all",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:scale-110 border-border"
          )}
          style={{ backgroundColor: displayColor }}
        >
          <input
            ref={nativeRef}
            type="color"
            value={displayColor}
            onChange={handleNative}
            disabled={disabled}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            tabIndex={-1}
          />
        </button>

        {/* Campo HEX */}
        <Input
          value={hex}
          onChange={handleText}
          disabled={disabled}
          className={cn(
            "w-28 font-mono text-xs uppercase",
            error && "border-red-400 focus-visible:ring-red-400"
          )}
          maxLength={7}
          placeholder="#000000"
        />
      </div>

      {/* Swatches de pré-definidos */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            disabled={disabled}
            onClick={() => handlePreset(c)}
            className={cn(
              "h-5 w-5 rounded-full border-2 transition-all",
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:scale-125",
              displayColor.toLowerCase() === c.toLowerCase()
                ? "border-foreground shadow-md scale-125"
                : "border-border/40"
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {error && (
        <p className="text-[11px] text-red-500">Formato inválido. Use #RRGGBB (ex: #1A2B3C)</p>
      )}
    </div>
  );
}
