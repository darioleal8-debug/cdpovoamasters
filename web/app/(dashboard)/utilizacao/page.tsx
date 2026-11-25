import { Suspense } from "react";
import { UsageDashboard } from "@/components/hoophub/usage-dashboard";

export const dynamic = "force-dynamic";

// O acesso (só Master Admin) é validado em ./layout.tsx e na API
export default function UtilizacaoPage() {
  return <Suspense><UsageDashboard /></Suspense>;
}
