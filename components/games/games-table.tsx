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
import { ArrowUpDown, Plus, Search, Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Event, EventType } from "@/types/database";
import { EVENT_TYPE_LABELS, formatDateShort } from "@/lib/utils";

interface GamesTableProps {
  events: Event[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (event: Event) => void;
  onDelete?: (event: Event) => void;
}

const TYPE_BADGE: Record<EventType, "default" | "secondary" | "outline"> = {
  jogo:   "default",
  treino: "secondary",
  outro:  "outline",
};

export function GamesTable({ events, loading, onAdd, onEdit, onDelete }: GamesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "event_date", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("todos");

  const filteredData = useMemo(
    () =>
      typeFilter === "todos"
        ? events
        : events.filter((e) => e.type === typeFilter),
    [events, typeFilter]
  );

  const columns = useMemo<ColumnDef<Event>[]>(
    () => [
      {
        accessorKey: "event_date",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Data <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{formatDateShort(row.original.event_date)}</p>
            <p className="text-xs text-muted-foreground">{row.original.event_time.slice(0, 5)}h</p>
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }) => (
          <Badge variant={TYPE_BADGE[row.original.type]}>
            {EVENT_TYPE_LABELS[row.original.type]}
          </Badge>
        ),
      },
      {
        accessorKey: "title",
        header: "Título",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.title}</p>
            {row.original.opponent && (
              <p className="text-xs text-muted-foreground">vs. {row.original.opponent}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "location",
        header: "Local",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.location}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => onEdit?.(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onDelete?.(row.original)}>
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
    data: filteredData,
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar evento..." value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="jogo">Jogos</SelectItem>
              <SelectItem value="treino">Treinos</SelectItem>
              <SelectItem value="outro">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onAdd} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> Adicionar Evento
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left font-medium">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{columns.map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
              : table.getRowModel().rows.length === 0
              ? <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhum evento encontrado.
                </td></tr>
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
        {table.getFilteredRowModel().rows.length} de {filteredData.length} evento(s)
      </p>
    </div>
  );
}
