"use client";

import { useState, useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttendanceDataPoint } from "@/types/database";

interface AttendanceChartProps {
  data: AttendanceDataPoint[];
  loading?: boolean;
}

export function AttendanceChart({ data, loading }: AttendanceChartProps) {
  const [clubPrimary, setClubPrimary] = useState("#111111");
  const [clubAccent,  setClubAccent]  = useState("#F28C28");

  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    const p = s.getPropertyValue("--club-primary").trim();
    const a = s.getPropertyValue("--club-secondary").trim();
    if (p) setClubPrimary(p);
    if (a) setClubAccent(a);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendário da Temporada</CardTitle>
        <CardDescription>
          Distribuição mensal de jogos e treinos
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Sem eventos registados nesta temporada.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  fontSize: "13px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "13px", paddingTop: "12px" }} />
              <Bar dataKey="jogos"   name="Jogos"   fill={clubPrimary} radius={[4, 4, 0, 0]} />
              <Bar dataKey="treinos" name="Treinos" fill={clubAccent}  radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
