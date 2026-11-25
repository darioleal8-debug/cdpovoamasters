import { LeagueTeams } from "./league-teams";

export const dynamic = "force-dynamic";

export default async function LeaguePage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  return <LeagueTeams league={league} />;
}
