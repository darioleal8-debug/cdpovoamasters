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
import { ArrowUpDown, CalendarX, Plus, Search, Trash2, Pencil, Radio, BarChart2, Map, Users, Trophy, Swords, Dumbbell } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Event, EventType } from "@/types/database";
import { EVENT_TYPE_LABELS, formatDateShort, buildMapsUrl } from "@/lib/utils";

interface GamesTableProps {
  events: Event[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (event: Event) => void;
  onDelete?: (event: Event) => void;
  onCallups?: (event: Event) => void;
}

const TYPE_BADGE: Record<EventType, "default" | "secondary" | "outline"> = {
  jogo:   "default",
  treino: "secondary",
  outro:  "outline",
};

export function GamesTable({ events, loading, onAdd, onEdit, onDelete, onCallups }: GamesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "event_date", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  // gameTypeFilter: 'todos' | 'official' | 'friendly'
  const [gameTypeFilter, setGameTypeFilter] = useState<string>("todos");

  const filteredData = useMemo(() => {
    let data = events;
    if (typeFilter !== "todos")     data = data.filter((e) => e.type === typeFilter);
    if (gameTypeFilter !== "todos") data = data.filter((e) => e.type !== "jogo" || e.game_type === gameTypeFilter);
    return data;
  }, [events, typeFilter, gameTypeFilter]);

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
        cell: ({ row }) => {
          const comp = row.original.competition;
          const isTaca = comp === "Taça";
          const isFriendly = row.original.type === "jogo" && row.original.game_type === "friendly";
          return (
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-medium">{row.original.title}</p>
                {/* Jogo de treino badge — destaque visual inequívoco */}
                {isFriendly && (
                  <Badge
                    variant="outline"
                    className="gap-0.5 text-[0.6rem] px-1.5 py-0 leading-4 shrink-0 border-amber-400/60 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
                  >
                    <Dumbbell className="h-2.5 w-2.5" />
                    Treino
                  </Badge>
                )}
                {row.original.type === "jogo" && comp && !isFriendly && (
                  <Badge
                    variant="outline"
                    className={`gap-0.5 text-[0.6rem] px-1.5 py-0 leading-4 shrink-0 ${
                      isTaca
                        ? "border-purple-400/60 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400"
                        : "border-cdpovoa-primary/30 bg-cdpovoa-primary/5 text-cdpovoa-primary/80"
                    }`}
                  >
                    {isTaca ? <Swords className="h-2.5 w-2.5" /> : <Trophy className="h-2.5 w-2.5" />}
                    {comp}
                  </Badge>
                )}
              </div>
              {row.original.opponent && (
                <p className="text-xs text-muted-foreground">
                  {row.original.title.includes("(Fora)") ? "@" : "vs."} {row.original.opponent}
                </p>
              )}
            </div>
          );
        },
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
          <TooltipProvider delayDuration={400}>
            <div className="flex items-center justify-end gap-1">
              {row.original.type === "jogo" && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={`/jogos/${row.original.id}/convocatoria`}>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-cdpovoa-primary hover:bg-cdpovoa-primary/10 px-2">
                          <Users className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline text-xs">Convocados</span>
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>Convocados</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={`/jogos/${row.original.id}/live`}>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-green-700 hover:text-green-800 hover:bg-green-50 px-2">
                          <Radio className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline text-xs">Live</span>
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>Iniciar jogo ao vivo</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={`/jogos/${row.original.id}/stats`}>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-cdpovoa-primary hover:bg-cdpovoa-primary/10 px-2">
                          <BarChart2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline text-xs">Stats</span>
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>Estatísticas</TooltipContent>
                  </Tooltip>
                  {buildMapsUrl(row.original.location) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a href={buildMapsUrl(row.original.location)!} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="h-8 gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2">
                            <Map className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline text-xs">Mapa</span>
                          </Button>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>Abrir no Google Maps</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit?.(row.original)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete?.(row.original)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eliminar</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        ),
        size: 140,
      },
    ],
    [onEdit, onDelete, onCallups]
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
          {/* Filtro por tipo de jogo — só relevante quando mostrando jogos */}
          {(typeFilter === "todos" || typeFilter === "jogo") && (
            <Select value={gameTypeFilter} onValueChange={setGameTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Modalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Oficial + Treino</SelectItem>
                <SelectItem value="official">Só Oficiais</SelectItem>
                <SelectItem value="friendly">Só Treinos</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {table.getFilteredRowModel().rows.length} evento(s)
          </span>
          <Button onClick={onAdd} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" /> Adicionar Evento
          </Button>
        </div>
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
                  <div className="flex flex-col items-center gap-2">
                    <CalendarX className="h-8 w-8 opacity-30" />
                    <p>Nenhum evento{globalFilter ? ` para "${globalFilter}"` : ""} encontrado.</p>
                    {globalFilter && (
                      <button onClick={() => setGlobalFilter("")} className="text-xs text-cdpovoa-primary hover:underline">
                        Limpar pesquisa
                      </button>
                    )}
                  </div>
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
    </div>
  );
}
