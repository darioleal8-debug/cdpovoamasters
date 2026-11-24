"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Loader2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";

interface AccessRequest {
  id: string;
  club_name: string;
  city: string;
  category: string;
  league: string;
  player_count: number;
  contact_name: string;
  contact_role: string;
  email: string;
  phone: string | null;
  status: "pendente" | "aceite" | "recusado";
  created_at: string;
  reviewed_at: string | null;
}

const CATEGORY_LABELS: Record<string, string> = { "+40": "Veteranos +40", "+50": "Veteranos +50", outro: "Outro" };
const ROLE_LABELS: Record<string, string> = { dirigente: "Dirigente", treinador: "Treinador", "jogador-organizador": "Jogador-organizador" };
const STATUS_LABELS: Record<AccessRequest["status"], string> = { pendente: "Pendente", aceite: "Aceite", recusado: "Recusado" };

type Filter = "pendente" | "todos";

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function MasterRequestsClient() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pendente");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ requests: AccessRequest[] }>("/api/master/access-requests");
    if (!r.ok) toast({ title: r.data.error ?? "Erro ao carregar pedidos", variant: "destructive" });
    else setRequests(r.data.requests);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(req: AccessRequest, status: AccessRequest["status"]) {
    setBusyId(req.id);
    const r = await api<{ request: AccessRequest }>("/api/master/access-requests", {
      method: "PATCH",
      body: JSON.stringify({ id: req.id, status }),
    });
    setBusyId(null);
    if (!r.ok) return toast({ title: r.data.error ?? "Erro", variant: "destructive" });
    toast({ title: status === "aceite" ? "Pedido aceite" : status === "recusado" ? "Pedido recusado" : "Pedido reposto como pendente" });
    load();
  }

  const pending = requests.filter((r) => r.status === "pendente").length;
  const shown = filter === "pendente" ? requests.filter((r) => r.status === "pendente") : requests;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Inbox className="h-5 w-5" /> Pedidos de acesso</h1>
        <p className="text-sm text-muted-foreground">
          Pedidos feitos em hoophub.pt/pedir-acesso. Só o Master Admin vê esta página. Para dar acesso a um clube, cria-o em Clubes e depois marca o pedido como aceite.
        </p>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Filtro">
        <Button size="sm" variant={filter === "pendente" ? "default" : "outline"} onClick={() => setFilter("pendente")}>
          Pendentes ({pending})
        </Button>
        <Button size="sm" variant={filter === "todos" ? "default" : "outline"} onClick={() => setFilter("todos")}>
          Todos ({requests.length})
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {filter === "pendente" ? "Sem pedidos pendentes." : "Ainda não há pedidos."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className="space-y-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.club_name}</span>
                    <Badge variant={r.status === "pendente" ? "default" : "secondary"}>{STATUS_LABELS[r.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.city} · {CATEGORY_LABELS[r.category] ?? r.category} · {r.player_count} jogadores · {r.league}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{fmt(r.created_at)}</p>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>{r.contact_name} <span className="text-muted-foreground">({ROLE_LABELS[r.contact_role] ?? r.contact_role})</span></span>
                <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 underline underline-offset-2"><Mail className="h-3.5 w-3.5" />{r.email}</a>
                {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 underline underline-offset-2"><Phone className="h-3.5 w-3.5" />{r.phone}</a>}
              </div>

              <div className="flex flex-wrap gap-2">
                {r.status !== "aceite" && (
                  <Button size="sm" disabled={busyId === r.id} onClick={() => setStatus(r, "aceite")}>Aceitar</Button>
                )}
                {r.status !== "recusado" && (
                  <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setStatus(r, "recusado")}>Recusar</Button>
                )}
                {r.status !== "pendente" && (
                  <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "pendente")}>Repor pendente</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
