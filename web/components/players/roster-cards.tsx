"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, UserPen, Trash2 } from "lucide-react";
import type { RosterEntry, PlayerPosition } from "@/types/database";
import { POSITION_LABELS } from "@/lib/utils";

interface Props {
  players:   RosterEntry[];
  loading?:  boolean;
  onEdit?:   (player: RosterEntry) => void;
  onDelete?: (player: RosterEntry) => void;
}

const POSITION_COLORS: Record<PlayerPosition, { bg: string; text: string }> = {
  base:    { bg: "rgba(10,18,32,.08)",    text: "var(--ink,#0A1220)" },
  extremo: { bg: "rgba(249,115,22,.1)",   text: "var(--action,#F97316)" },
  poste:   { bg: "rgba(18,133,91,.1)",    text: "var(--ok,#12855B)" },
};

function initials(name: string): string {
  return name.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function RosterCards({ players, loading, onEdit, onDelete }: Props) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? players.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          String(p.number ?? "").includes(search)
      )
    : players;

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "rgba(0,0,0,.04)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Pesquisa */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "rgba(0,0,0,.3)" }} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar jogador…"
          className="w-full h-11 rounded-xl pl-10 pr-4 text-[15px] outline-none"
          style={{
            background: "var(--paper,#F6F7F9)",
            border: "1px solid var(--line,#E4E7EE)",
            color: "var(--text,#0F1729)",
          }}
        />
      </div>

      {/* Grelha 2 colunas */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((player) => {
          const pos    = player.position as PlayerPosition | null;
          const colors = pos ? POSITION_COLORS[pos] : null;

          return (
            <div
              key={player.player_id}
              className="relative flex flex-col gap-2 rounded-2xl p-3"
              style={{
                background: "var(--paper,#F6F7F9)",
                border: "1px solid var(--line,#E4E7EE)",
              }}
            >
              {/* Número */}
              {player.number && (
                <span
                  className="absolute top-3 right-3 font-condensed font-bold text-lg leading-none"
                  style={{ color: "rgba(0,0,0,.12)" }}
                >
                  #{player.number}
                </span>
              )}

              {/* Avatar */}
              {player.photo_url ? (
                <img
                  src={player.photo_url}
                  alt={player.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-[14px] font-bold"
                  style={{ background: "rgba(10,18,32,.08)", color: "var(--ink,#0A1220)" }}
                >
                  {initials(player.name)}
                </div>
              )}

              {/* Nome */}
              <Link
                href={`/jogadores/${player.player_id}`}
                className="text-[14px] font-semibold leading-tight line-clamp-2"
                style={{ color: "var(--ink,#0A1220)" }}
              >
                {player.name}
              </Link>

              {/* Posição */}
              {pos && colors && (
                <span
                  className="self-start text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {POSITION_LABELS[pos] ?? pos}
                </span>
              )}

              {/* Sem conta */}

              {/* Ações */}
              {(onEdit || onDelete) && (
                <div className="flex gap-1.5 mt-auto pt-1">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(player)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl transition-opacity active:opacity-60"
                      style={{ background: "rgba(10,18,32,.06)", touchAction: "manipulation" }}
                      aria-label={`Editar ${player.name}`}
                    >
                      <UserPen className="h-3.5 w-3.5" style={{ color: "var(--muted-text,#5A6478)" }} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(player)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl transition-opacity active:opacity-60"
                      style={{ background: "rgba(217,45,32,.06)", touchAction: "manipulation" }}
                      aria-label={`Eliminar ${player.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--bad,#D92D20)" }} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-[13px]" style={{ color: "var(--muted-text,#5A6478)" }}>
          Nenhum jogador encontrado
        </p>
      )}
    </div>
  );
}
