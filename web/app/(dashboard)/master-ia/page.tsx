import { redirect } from "next/navigation";
import { authorizeMaster } from "@/lib/auth/master";
import { MasterAiClient } from "./master-ai-client";

export const dynamic = "force-dynamic";

export default async function MasterIaPage() {
  const m = await authorizeMaster();
  if (!m.ok) redirect("/dashboard");
  return <MasterAiClient />;
}
