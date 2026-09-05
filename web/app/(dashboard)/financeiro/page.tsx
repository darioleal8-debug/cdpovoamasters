"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FinanceDashboardTab } from "@/components/finance/finance-dashboard-tab";
import { EntriesTab }          from "@/components/finance/entries-tab";
import { ExpensesTab }         from "@/components/finance/expenses-tab";
import { CashTab }             from "@/components/finance/cash-tab";
import { ReportsTab }          from "@/components/finance/reports-tab";
import { BarChart3, TrendingUp, TrendingDown, PiggyBank, FileText } from "lucide-react";

export default function FinanceiroPage() {
  const [dashboardKey, setDashboardKey] = useState(0);

  const handleTabChange = useCallback((value: string) => {
    if (value === "dashboard") setDashboardKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Gestão Financeira
        </h1>
        <p className="text-muted-foreground">
          Controlo financeiro do clube — entradas, saídas e caixa.
        </p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6" onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="entradas" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Entradas
          </TabsTrigger>
          <TabsTrigger value="saidas" className="gap-1.5">
            <TrendingDown className="h-4 w-4" />
            Saídas
          </TabsTrigger>
          <TabsTrigger value="caixa" className="gap-1.5">
            <PiggyBank className="h-4 w-4" />
            Caixa
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Relatórios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <FinanceDashboardTab refreshKey={dashboardKey} />
        </TabsContent>

        <TabsContent value="entradas">
          <EntriesTab />
        </TabsContent>

        <TabsContent value="saidas">
          <ExpensesTab />
        </TabsContent>

        <TabsContent value="caixa">
          <CashTab />
        </TabsContent>

        <TabsContent value="relatorios">
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
