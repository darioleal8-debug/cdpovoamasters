import { Suspense } from "react";
import { TeamAnalytics } from "./team-analytics";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ league: string; team: string }> }) {
  const { league, team } = await params;
  return <Suspense><TeamAnalytics league={league} team={team} /></Suspense>;
}
