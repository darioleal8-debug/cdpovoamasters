"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Plus, Search, Trash2, UserPen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerWithUser } from "@/types/database";
import { POSITION_LABELS } from "@/lib/utils";

interface PlayersTableProps {
  players: PlayerWithUser[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (player: PlayerWithUser) => void;
  onDelete?: (player: PlayerWithUser) => void;
}

const POSITION_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  base:    "default",
  extremo: "secondary",
  poste:   "outline",
};

export function PlayersTable({
  players,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: PlayersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<PlayerWithUser>[]>(
    () => [
      {
        accessorKey: "jersey_number",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            #
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-base font-bold text-cdpovoa-blue">
            {row.original.jersey_number ?? "—"}
          </span>
        ),
        size: 60,
      },
      {
        accessorKey: "user.name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Nome
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.user.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.user.email}</p>
          </div>
        ),
      },
      {
        accessorKey: "position",
        header: "Posição",
        cell: ({ row }) => {
          const pos = row.original.position;
          if (!pos) return <span className="text-muted-foreground">—</span>;
          return (
            <Badge variant={POSITION_BADGE[pos] ?? "outline"}>
              {POSITION_LABELS[pos]}
            </Badge>
          );
        },
      },
      {
        accessorKey: "age",
        header: "Idade",
        cell: ({ row }) =>
          row.original.age ? `${row.original.age} anos` : "—",
      },
      {
        accessorKey: "height_cm",
        header: "Altura",
        cell: ({ row }) =>
          row.original.height_cm ? `${row.original.height_cm} cm` : "—",
      },
      {
        accessorKey: "user.status",
        header: "Estado",
        cell: ({ row }) => {
          const status = row.original.user.status;
          return (
            <Badge variant={status === "ativo" ? "success" : "warning"}>
              {status === "ativo" ? "Ativo" : "Pendente"}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit?.(row.original)}
              aria-label="Editar jogador"
            >
              <UserPen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete?.(row.original)}
              aria-label="Remover jogador"
            >
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
      {/* Barra de ferramentas */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar jogador..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={onAdd} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          Adicionar Jogador
        </Button>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left font-medium"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder
                      ? null
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
                    <td
                      colSpan={columns.length}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      Nenhum jogador encontrado.
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

      <p className="text-xs text-muted-foreground">
        {table.getFilteredRowModel().rows.length} de {players.length} jogador(es)
      </p>
    </div>
  );
}
