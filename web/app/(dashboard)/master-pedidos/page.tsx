import { redirect } from "next/navigation";
import { authorizeMaster } from "@/lib/auth/master";
import { MasterRequestsClient } from "./master-requests-client";

export const dynamic = "force-dynamic";

export default async function MasterPedidosPage() {
  // Só o Master Admin vê esta página (a API volta a validar em cada pedido)
  const m = await authorizeMaster();
  if (!m.ok) redirect("/dashboard");
  return <MasterRequestsClient />;
}
