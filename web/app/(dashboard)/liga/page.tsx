"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { LeagueTeam } from "@/types/competitions";

function initials(t: LeagueTeam) {
  return (
    t.sigla ??
    t.name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()
  );
}

export default function LigaAdminPage() {
  const [teams, setTeams]       = useState<LeagueTeam[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [saving, setSaving]     = useState<string | null>(null);

  // Formulário de nova equipa
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", locality: "", home_pavilion: "", sigla: "", contact_name: "", contact_phone: "" });
  const [creating, setCreating] = useState(false);

  // Edição inline
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LeagueTeam>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/league-teams");
      if (!res.ok) { setError("Sem permissão ou erro ao carregar."); return; }
      const json = await res.json();
      setTeams(json.teams ?? []);
    } catch { setError("Erro de rede."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createTeam() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/league-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      setShowForm(false);
      setForm({ name: "", locality: "", home_pavilion: "", sigla: "", contact_name: "", contact_phone: "" });
      await load();
    } finally { setCreating(false); }
  }

  async function saveEdit(id: string) {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/league-teams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      setEditing(null);
      await load();
    } finally { setSaving(null); }
  }

  async function deleteTeam(id: string, name: string) {
    if (!confirm(`Apagar equipa "${name}"? Esta acção não pode ser desfeita.`)) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/league-teams/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Erro"); return; }
      await load();
    } finally { setSaving(null); }
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">A carregar…</div>;
  if (error)   return <div className="p-8 text-center text-sm text-red-500">{error}</div>;

  const realTeams = teams.filter((t) => !t.name.startsWith("Vencedor Jogo"));
  const placeholders = teams.filter((t) => t.name.startsWith("Vencedor Jogo"));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Gestão Liga INATEL</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {realTeams.length} equipas · <Link href="/liga-inatel" className="underline" target="_blank">ver página pública</Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/resultados"
            className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent transition-colors"
          >
            Submissões pendentes
          </Link>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Nova equipa
          </button>
        </div>
      </div>

      {/* Formulário nova equipa */}
      {showForm && (
        <div className="rounded-xl border p-4 space-y-3 bg-card">
          <h2 className="font-semibold text-sm">Nova equipa</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: "name",          label: "Nome *",         placeholder: "Ex: BC Barcelos" },
              { key: "sigla",         label: "Sigla",          placeholder: "Ex: BCB" },
              { key: "locality",      label: "Localidade",     placeholder: "Ex: Barcelos" },
              { key: "home_pavilion", label: "Pavilhão",       placeholder: "Ex: Pav. Desportivo" },
              { key: "contact_name",  label: "Delegado",       placeholder: "Nome do responsável" },
              { key: "contact_phone", label: "Contacto",       placeholder: "+351 9xx xxx xxx" },
            ] as { key: keyof typeof form; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={createTeam}
              disabled={!form.name.trim() || creating}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {creating ? "A criar…" : "Criar equipa"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de equipas */}
      <div className="space-y-2">
        {realTeams.map((team) => {
          const isEditing = editing === team.id;
          const isSaving  = saving  === team.id;

          return (
            <div
              key={team.id}
              className={`rounded-xl border p-4 transition-opacity ${isSaving ? "opacity-50 pointer-events-none" : "bg-card"}`}
            >
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { key: "name",          label: "Nome *" },
                      { key: "sigla",         label: "Sigla" },
                      { key: "locality",      label: "Localidade" },
                      { key: "home_pavilion", label: "Pavilhão" },
                      { key: "contact_name",  label: "Delegado" },
                      { key: "contact_phone", label: "Contacto" },
                    ] as { key: keyof Partial<LeagueTeam>; label: string }[]).map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
                        <input
                          type="text"
                          value={(editForm[key] as string) ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                          className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(team.id)}
                      className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                    style={{ background: team.is_our_team ? "#F97316" : "#F0EAE1", color: team.is_our_team ? "#15110E" : "#6F675F" }}
                  >
                    {initials(team)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {team.name}
                      {team.is_our_team && <span className="ml-1.5 text-[10px] text-orange-500 font-mono">★ nossa equipa</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[team.locality, team.home_pavilion].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {team.contact_name && (
                    <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">{team.contact_name}</p>
                  )}
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setEditing(team.id); setEditForm({ name: team.name, sigla: team.sigla ?? "", locality: team.locality ?? "", home_pavilion: team.home_pavilion ?? "", contact_name: team.contact_name ?? "", contact_phone: team.contact_phone ?? "" }); }}
                      className="px-2.5 py-1 rounded border text-xs hover:bg-accent transition-colors"
                    >
                      Editar
                    </button>
                    {!team.is_our_team && (
                      <button
                        onClick={() => deleteTeam(team.id, team.name)}
                        className="px-2.5 py-1 rounded border border-red-200 text-red-600 text-xs hover:bg-red-50 transition-colors"
                      >
                        Apagar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Placeholders */}
      {placeholders.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground font-medium py-2">
            {placeholders.length} entradas placeholder (Vencedor Jogo X)
          </summary>
          <div className="mt-2 space-y-1 pl-2">
            {placeholders.map((t) => (
              <p key={t.id} className="text-xs text-muted-foreground">{t.name}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
