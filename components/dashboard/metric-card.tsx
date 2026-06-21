import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  accent?: "blue" | "red" | "green" | "amber";
  loading?: boolean;
}

const accentClasses = {
  blue:  { icon: "bg-blue-50 text-cdpovoa-blue", border: "border-t-cdpovoa-blue" },
  red:   { icon: "bg-red-50 text-red-600",        border: "border-t-red-600" },
  green: { icon: "bg-green-50 text-green-700",    border: "border-t-green-600" },
  amber: { icon: "bg-amber-50 text-amber-700",    border: "border-t-amber-500" },
};

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  accent = "blue",
  loading = false,
}: MetricCardProps) {
  const { icon: iconClass, border: borderClass } = accentClasses[accent];

  if (loading) {
    return (
      <Card className={cn("border-t-4", borderClass)}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-t-4", borderClass)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {trend && (
              <p
                className={cn(
                  "text-xs font-medium",
                  trend.value >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value}% {trend.label}
              </p>
            )}
          </div>
          <div className={cn("rounded-lg p-2.5", iconClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
