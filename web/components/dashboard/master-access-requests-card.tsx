"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";

interface Summary {
  pending: number;
  latest: Array<{ id: string; club_name: string; city: string; contact_name: string; created_at: string }>;
}

// Notificação do Master Admin: aparece no dashboard enquanto houver pedidos de acesso pendentes.
// Só é montado para o Master (verificado no servidor); a API volta a validar.
export function MasterAccessRequestsCard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/master/access-requests?summary=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setSummary(j as Summary); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!summary || summary.pending === 0) return null;

  const more = summary.pending - summary.latest.length;

  return (
    <Link
      href="/master-pedidos"
      className="flex items-start gap-3 rounded-2xl p-4 transition-opacity hover:opacity-90"
      style={{ background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.3)" }}
      role="status"
    >
      <Inbox className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--action,#F97316)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--text,#0A1220)" }}>
          {summary.pending === 1 ? "1 pedido de acesso por analisar" : `${summary.pending} pedidos de acesso por analisar`}
        </p>
        <ul className="mt-1 space-y-0.5">
          {summary.latest.map((r) => (
            <li key={r.id} className="truncate text-xs" style={{ color: "var(--muted-text,#5A6478)" }}>
              {r.club_name} · {r.city} · {r.contact_name}
            </li>
          ))}
          {more > 0 && (
            <li className="text-xs" style={{ color: "var(--muted-text,#5A6478)" }}>e mais {more}…</li>
          )}
        </ul>
      </div>
      <ChevronRight className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--muted-text,#5A6478)" }} />
    </Link>
  );
}
