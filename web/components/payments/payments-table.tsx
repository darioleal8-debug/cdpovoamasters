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
import { ArrowUpDown, CheckCircle2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaymentWithUser } from "@/types/database";
import { formatCurrency, formatMonth } from "@/lib/utils";

interface PaymentsTableProps {
  payments: PaymentWithUser[];
  loading?: boolean;
  onMarkPaid?: (payment: PaymentWithUser) => void;
}

export function PaymentsTable({ payments, loading, onMarkPaid }: PaymentsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  const filteredData = useMemo(
    () =>
      statusFilter === "todos"
        ? payments
        : payments.filter((p) => p.status === statusFilter),
    [payments, statusFilter]
  );

  const pendingCount = useMemo(
    () => payments.filter((p) => p.status === "pendente").length,
    [payments]
  );

  const columns = useMemo<ColumnDef<PaymentWithUser>[]>(
    () => [
      {
        accessorKey: "user.name",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Jogador <ArrowUpDown className="ml-1 h-3 w-3" />
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
        accessorKey: "month",
        header: "Mês",
        cell: ({ row }) => `${formatMonth(row.original.month)} ${row.original.reference_year}`,
      },
      {
        accessorKey: "amount",
        header: "Valor",
        cell: ({ row }) => (
          <span className="font-medium">{formatCurrency(row.original.amount)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "pago" ? "success" : "warning"}>
            {row.original.status === "pago" ? "Pago" : "Pendente"}
          </Badge>
        ),
      },
      {
        accessorKey: "paid_at",
        header: "Pago em",
        cell: ({ row }) =>
          row.original.paid_at
            ? new Date(row.original.paid_at).toLocaleDateString("pt-PT")
            : "—",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.status === "pendente" ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => onMarkPaid?.(row.original)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Marcar Pago
            </Button>
          ) : null,
      },
    ],
    [onMarkPaid]
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
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {pendingCount} quota{pendingCount !== 1 ? "s" : ""} pendente{pendingCount !== 1 ? "s" : ""} por regularizar.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar jogador..." value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pago">Pagos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
            </SelectContent>
          </Select>
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
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{columns.map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}</tr>
                ))
              : table.getRowModel().rows.length === 0
              ? <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                  Nenhum pagamento encontrado.
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
        {table.getFilteredRowModel().rows.length} de {filteredData.length} registo(s)
      </p>
    </div>
  );
}
