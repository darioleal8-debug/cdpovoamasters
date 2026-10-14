"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AdminSubmission } from "@/lib/competitions-data";

const MONTH_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
function fmtDate(d: string) {
  const dt = new Date(d + "T12:00:00");
  return `${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

export default function ResultadosPendentesPage() {
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const router = useRouter();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/result-submissions");
      if (!res.ok) {
        if (res.status === 403) setError("Sem permissão para aceder a esta página.");
        else setError("Erro ao carregar submissões.");
        return;
      }
      const json = await res.json();
      setSubmissions(json.submissions ?? []);
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/result-submissions/${id}/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      await load();
      router.refresh();
    } finally {
      setProcessing(null);
    }
  }

  async function reject(id: string) {
    const reason = rejectReason[id]?.trim() || null;
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/result-submissions/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      await load();
      router.refresh();
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground text-sm">A carregar…</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 text-sm">{error}</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Resultados pendentes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {submissions.length} submissão{submissions.length !== 1 ? "ões" : ""} pendente{submissions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhuma submissão pendente. ✓
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border p-4 space-y-3",
                processing === s.id ? "opacity-60 pointer-events-none" : "border-border bg-card"
              )}
            >
              {/* Game info */}
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-semibold text-sm">{s.home_team_name} vs {s.away_team_name}</p>
                  {s.event && (
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(s.event.event_date)}
                      {s.event.event_time ? ` · ${s.event.event_time.slice(0, 5)}` : ""}
                      {s.event.location ? ` · ${s.event.location}` : ""}
                    </p>
                  )}
                </div>
                <div className="text-2xl font-bold tabular-nums shrink-0">
                  {s.home_score} – {s.away_score}
                </div>
              </div>

              {/* Submitter */}
              <div className="text-xs text-muted-foreground space-y-0.5 border-t border-border/50 pt-2">
                <p>Submetido por: <span className="text-foreground font-medium">{s.submitted_by_name}</span>
                  {s.submitted_by_team ? ` (${s.submitted_by_team})` : ""}
                </p>
                {s.submitted_by_contact && <p>Contacto: {s.submitted_by_contact}</p>}
                {s.notes && <p>Nota: <span className="italic">{s.notes}</span></p>}
                <p>{new Date(s.submitted_at).toLocaleString("pt-PT")}</p>
              </div>

              {/* Reject reason input */}
              <input
                type="text"
                placeholder="Motivo da rejeição (opcional)"
                value={rejectReason[s.id] ?? ""}
                onChange={(e) => setRejectReason((prev) => ({ ...prev, [s.id]: e.target.value }))}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => approve(s.id)}
                  disabled={!!processing}
                  className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Aprovar
                </button>
                <button
                  onClick={() => reject(s.id)}
                  disabled={!!processing}
                  className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
