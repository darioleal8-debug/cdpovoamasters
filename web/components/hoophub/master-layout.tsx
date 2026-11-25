import { redirect } from "next/navigation";
import { authorizeMaster } from "@/lib/auth/master";
import { HoopHubTabs } from "./hoophub-tabs";

/**
 * Layout partilhado de todas as páginas da Gestão HoopHub: só o Master Admin passa
 * (a API volta a validar em cada pedido) e todas mostram a mesma barra de secções.
 */
export async function MasterLayout({ children }: { children: React.ReactNode }) {
  const m = await authorizeMaster();
  if (!m.ok) redirect("/dashboard");
  return (
    <div>
      <HoopHubTabs />
      {children}
    </div>
  );
}
