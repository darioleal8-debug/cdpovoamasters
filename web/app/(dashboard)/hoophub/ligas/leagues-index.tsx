"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Trophy } from "lucide-react";

interface LeagueRow { name: string; clubs: number; active_clubs: number; members: number; teams?: number; teams_without_club?: number }

export function LeaguesIndex() {
  const [leagues, setLeagues] = useState<LeagueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/master/overview?days=30")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Erro"); setLeagues(j.leagues); })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">{error}</p>;
  if (!leagues) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-condensed text-2xl font-bold uppercase tracking-display">Ligas</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Escolhe uma liga para ver as analytics de cada equipa.</p>
      </div>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {leagues.map((l) => (
          <Link key={l.name} href={`/hoophub/ligas/${encodeURIComponent(l.name)}`}
            className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/30">
            <Trophy className="h-4 w-4 text-orange-500" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{l.name}</p>
              <p className="text-xs text-muted-foreground">
                {l.teams !== undefined && <>{l.teams} equipas · </>}{l.clubs} clube(s) na app ({l.active_clubs} ativos) · {l.members} utilizador(es)
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
        {leagues.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Sem ligas.</p>}
      </div>
    </div>
  );
}
