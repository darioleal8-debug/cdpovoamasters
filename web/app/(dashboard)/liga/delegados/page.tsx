"use client";

import { useEffect, useState, useCallback } from "react";

type Team = { id: string; name: string; sigla: string | null };
type Delegate = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  league_teams: { id: string; name: string; sigla: string | null } | null;
};

export default function LigaDelegadosPage() {
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [teams, setTeams]         = useState<Team[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Invite form
  const [email, setEmail]         = useState("");
  const [teamId, setTeamId]       = useState("");
  const [inviting, setInviting]   = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk]   = useState(false);

  const [removing, setRemoving]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [delRes, teamsRes] = await Promise.all([
        fetch("/api/admin/league-delegates"),
        fetch("/api/admin/league-teams"),
      ]);
      if (!delRes.ok || !teamsRes.ok) {
        setError("Sem permissão ou erro ao carregar.");
        return;
      }
      const [delJson, teamsJson] = await Promise.all([delRes.json(), teamsRes.json()]);
      setDelegates(delJson.delegates ?? []);
      setTeams((teamsJson.teams ?? []).filter((t: Team & { name: string }) => !t.name.startsWith("Vencedor Jogo")));
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !teamId) return;
    setInviting(true);
    setInviteError(null);
    setInviteOk(false);
    try {
      const res = await fetch("/api/admin/league-delegates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), team_id: teamId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(json.error ?? "Erro ao enviar convite.");
        return;
      }
      setInviteOk(true);
      setEmail("");
      setTeamId("");
      await load();
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(id: string, teamName: string) {
    if (!confirm(`Remover delegado da equipa "${teamName}"? A conta será apagada.`)) return;
    setRemoving(id);
    try {
      const res = await fetch(`/api/admin/league-delegates/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      await load();
    } finally {
      setRemoving(null); }
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  if (error)   return <div className="p-8 text-center text-sm text-red-500">{error}</div>;

  // Group delegates by team
  const byTeam = delegates.reduce<Record<string, Delegate[]>>((acc, d) => {
    const key = d.league_teams?.id ?? "sem-equipa";
    (acc[key] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Delegados de Equipa</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {delegates.length} delegado{delegates.length !== 1 ? "s" : ""} registado{delegates.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Invite form */}
      <div className="rounded-xl border p-4 space-y-3 bg-card">
        <h2 className="font-semibold text-sm">Convidar novo delegado</h2>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="delegado@equipa.pt"
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Equipa *</label>
              <select
                required
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleccionar equipa…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {inviteError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {inviteError}
            </p>
          )}
          {inviteOk && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Convite enviado. O delegado receberá um email para definir a palavra-passe.
            </p>
          )}

          <button
            type="submit"
            disabled={inviting || !email.trim() || !teamId}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {inviting ? "A enviar…" : "Enviar convite"}
          </button>
        </form>
      </div>

      {/* Delegates list */}
      {delegates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum delegado ainda.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(byTeam).map(([teamKey, teamDelegates]) => {
            const teamName = teamDelegates[0]?.league_teams?.name ?? "Equipa desconhecida";
            const teamSigla = teamDelegates[0]?.league_teams?.sigla;
            return (
              <div key={teamKey} className="rounded-xl border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                    style={{ background: "#F0EAE1", color: "#6F675F" }}
                  >
                    {teamSigla ?? teamName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-semibold text-sm">{teamName}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {teamDelegates.length} delegado{teamDelegates.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y">
                  {teamDelegates.map((d) => (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between gap-3 px-4 py-3 ${removing === d.id ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">{d.user_id.slice(0, 8)}…</p>
                        <p className="text-xs text-muted-foreground">
                          Criado em {new Date(d.created_at).toLocaleDateString("pt-PT")}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemove(d.id, teamName)}
                        className="px-2.5 py-1 rounded border border-red-200 text-red-600 text-xs hover:bg-red-50 transition-colors"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
