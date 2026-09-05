"use client";

import { useState, useEffect } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PositionCount } from "@/types/database";

interface PositionsChartProps {
  data: PositionCount[];
  loading?: boolean;
}

export function PositionsChart({ data, loading }: PositionsChartProps) {
  const [chartColors, setChartColors] = useState(["#111111", "#F28C28", "#555555", "#94a3b8"]);
  const total = data.reduce((s, d) => s + d.value, 0);

  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    const primary = s.getPropertyValue("--club-primary").trim()  || "#111111";
    const accent  = s.getPropertyValue("--club-secondary").trim() || "#F28C28";
    setChartColors([primary, accent, "#555555", "#94a3b8"]);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-52" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="mx-auto h-[180px] w-[180px] rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de Posições</CardTitle>
        <CardDescription>Plantel da temporada ativa por posição</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            Sem jogadores inscritos nesta temporada.
          </div>
        ) : (
          <div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {data.map((_, index) => (
                    <Cell key={index} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    fontSize: "13px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legenda com contagens e percentagens */}
            <div className="mt-3 space-y-2">
              {data.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: chartColors[i % chartColors.length] }}
                    />
                    <span>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="font-bold">{item.value}</span>
                    <span className="w-9 text-right text-xs text-muted-foreground">
                      {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "—"}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold tabular-nums">{total}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
