import { HoopHubOverview } from "./hoophub-overview";

export const dynamic = "force-dynamic";

// O acesso (só Master Admin) é validado em ./layout.tsx e na API
export default function HoopHubPage() {
  return <HoopHubOverview />;
}
