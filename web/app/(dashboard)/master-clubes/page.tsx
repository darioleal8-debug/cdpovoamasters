import { redirect } from "next/navigation";
import { authorizeMaster } from "@/lib/auth/master";
import { MasterClubsClient } from "./master-clubs-client";

export const dynamic = "force-dynamic";

export default async function MasterClubesPage() {
  // Só o Master Admin vê esta página (a API volta a validar em cada pedido)
  const m = await authorizeMaster();
  if (!m.ok) redirect("/dashboard");
  return <MasterClubsClient />;
}
