"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Search, Trash2, UserPen, UserPlus } from "lucide-react";
import { Badge }     from "@/components/ui/badge";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Skeleton }  from "@/components/ui/skeleton";
import type { RosterEntry, PlayerPosition } from "@/types/database";
import { POSITION_LABELS } from "@/lib/utils";
import { calculateAge } from "@/lib/age";

interface RosterTableProps {
  players:         RosterEntry[];
  loading?:        boolean;
  onEdit?:         (player: RosterEntry) => void;
  onDelete?:       (player: RosterEntry) => void;
  onCreateAccount?:() => void;
}

const POSITION_BADGE: Record<PlayerPosition, "default" | "secondary" | "outline"> = {
  base:    "default",
  extremo: "secondary",
  poste:   "outline",
};

function PlayerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <div className="h-9 w-9 rounded-full bg-cdpovoa-primary/10 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-cdpovoa-primary">{initials}</span>
    </div>
  );
}

export function RosterTable({ players, loading, onEdit, onDelete, onCreateAccount }: RosterTableProps) {
  const [sorting,      setSorting]      = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<RosterEntry>[]>(
    () => [
      {
        id: "avatar",
        header: "",
        cell: ({ row }) => <PlayerAvatar name={row.original.name} photoUrl={row.original.photo_url} />,
        size: 48,
        enableSorting: false,
      },
      {
        accessorKey: "number",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            # <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-base font-bold text-cdpovoa-primary">
            {row.original.number ?? "—"}
          </span>
        ),
        size: 60,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Nome <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div>
            {row.original.player_id ? (
              <Link
                href={`/jogadores/${row.original.player_id}`}
                className="font-medium hover:text-cdpovoa-primary hover:underline underline-offset-2 transition-colors"
              >
                {row.original.name}
              </Link>
            ) : (
              <span className="font-medium">{row.original.name}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "position",
        header: "Posição",
        cell: ({ row }) => {
          const pos = row.original.position as PlayerPosition | null;
          if (!pos) return <span className="text-muted-foreground">—</span>;
          return <Badge variant={POSITION_BADGE[pos] ?? "outline"}>{POSITION_LABELS[pos] ?? pos}</Badge>;
        },
      },
      {
        accessorKey: "height",
        header: "Altura",
        cell: ({ row }) => row.original.height ? `${row.original.height} cm` : "—",
        size: 90,
      },
      {
        accessorKey: "weight",
        header: "Peso",
        cell: ({ row }) => row.original.weight ? `${row.original.weight} kg` : "—",
        size: 90,
      },
      {
        accessorKey: "age",
        header: "Idade",
        cell: ({ row }) => {
          const p = row.original;
          const age = p.birth_date
            ? calculateAge(p.birth_date)
            : p.age ?? null;
          return age != null ? `${age} a` : "—";
        },
        size: 80,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => onEdit?.(row.original)} aria-label="Editar jogador">
              <UserPen className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete?.(row.original)} aria-label="Remover jogador">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        size: 80,
      },
    ],
    [onEdit, onDelete]
  );

  const table = useReactTable({
    data: players,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar jogador..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
          {table.getFilteredRowModel().rows.length} de {players.length} jogador(es)
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left font-medium"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                    {header.isPlaceholder ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.length === 0
              ? (
                <tr>
                  <td colSpan={columns.length}
                    className="px-4 py-14 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <UserPlus className="h-8 w-8 opacity-30" />
                      <p>
                        {globalFilter
                          ? `Nenhum jogador encontrado para "${globalFilter}".`
                          : "Nenhum jogador nesta temporada."}
                      </p>
                      {globalFilter ? (
                        <button onClick={() => setGlobalFilter("")} className="text-xs text-cdpovoa-primary hover:underline">
                          Limpar pesquisa
                        </button>
                      ) : onCreateAccount ? (
                        <Button variant="outline" size="sm" onClick={onCreateAccount} className="gap-1.5">
                          <UserPlus className="h-4 w-4" />
                          Criar Conta de Jogador
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
              : table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
