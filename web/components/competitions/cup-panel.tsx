"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { CupBracket, CupGameList } from "@/components/competitions/cup-bracket";
import type { CupBracket as CupBracketData } from "@/lib/cup";

/**
 * "Taça da Liga INATEL" na app de gestão HoopHub: quadro + calendário/resultados da Taça.
 * Competição à parte da Liga INATEL (nunca misturada com o calendário da Liga).
 * Painel sempre escuro (identidade da Liga INATEL) para ler bem em qualquer tema.
 */
export function CupPanel() {
  const [data, setData] = useState<CupBracketData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/club/cup")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: CupBracketData) => { if (alive) setData(j); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Não foi possível carregar a Taça da Liga INATEL.</p>;
  }
  if (!data) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted/40" aria-busy />;
  }
  if (!data.competition || data.rounds.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">A Taça da Liga INATEL ainda não está disponível.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6" style={{ color: "#F97316" }} />
          <div>
            <h2 className="text-xl font-bold tracking-tight">Taça da Liga INATEL</h2>
            <p className="text-sm text-muted-foreground">
              Competição à parte da Liga · eliminatórias a eliminar · calendário provisório
            </p>
          </div>
        </div>
        <Link href="/liga-inatel/taca" className="text-sm font-semibold" style={{ color: "#F97316" }}>
          Ver no site da Liga INATEL →
        </Link>
      </div>

      <div className="rounded-2xl p-4 md:p-6" style={{ background: "#15110E", border: "1px solid rgba(249,115,22,.25)" }}>
        <CupBracket rounds={data.rounds} champion={data.champion} theme="dark" />
      </div>

      <div className="rounded-2xl p-4 md:p-6" style={{ background: "#15110E", border: "1px solid rgba(249,115,22,.25)" }}>
        <CupGameList rounds={data.rounds} theme="dark" />
      </div>
    </div>
  );
}
