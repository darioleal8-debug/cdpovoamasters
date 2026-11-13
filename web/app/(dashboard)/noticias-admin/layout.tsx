import { redirect } from "next/navigation";
import { authorizeMaster } from "@/lib/auth/master";

export const dynamic = "force-dynamic";

// Área restrita ao Master Admin (a API volta a validar em cada pedido)
export default async function Layout({ children }: { children: React.ReactNode }) {
  const m = await authorizeMaster();
  if (!m.ok) redirect("/dashboard");
  return <>{children}</>;
}
