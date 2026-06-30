"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toaster";
import type {
  Training, TrainingNote, TrainingAttendance,
  ClubEvent, AttendanceStatus,
} from "@/types/database";

// ─── Hook: lista de treinos da temporada ──────────────────

export function useTrainings(seasonId: string | null) {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!seasonId) { setTrainings([]); setLoading(false); return; }
    setLoading(true);
    const res = await fetch(`/api/trainings?season_id=${seasonId}`);
    const json = await res.json();
    setTrainings(json.trainings ?? []);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  async function createTraining(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/trainings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao criar treino", description: json.error, variant: "destructive" });
      return false;
    }
    toast({ title: `${json.created} treino(s) criado(s)` });
    await load();
    return true;
  }

  async function updateTraining(id: string, body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/trainings/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao atualizar treino", description: json.error, variant: "destructive" });
      return false;
    }
    await load();
    return true;
  }

  async function deleteTraining(id: string): Promise<boolean> {
    const res = await fetch(`/api/trainings/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: "Erro ao eliminar treino", variant: "destructive" });
      return false;
    }
    toast({ title: "Treino eliminado" });
    setTrainings((prev) => prev.filter((t) => t.id !== id));
    return true;
  }

  return { trainings, loading, createTraining, updateTraining, deleteTraining, refresh: load };
}

// ─── Hook: presenças de um treino ────────────────────────

export function useAttendance(trainingId: string | null) {
  const [attendance, setAttendance] = useState<TrainingAttendance[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!trainingId) { setAttendance([]); return; }
    setLoading(true);
    const res = await fetch(`/api/trainings/${trainingId}/attendance`);
    const json = await res.json();
    setAttendance(json.attendance ?? []);
    setLoading(false);
  }, [trainingId]);

  useEffect(() => { load(); }, [load]);

  async function saveAttendance(records: { player_id: string; status: AttendanceStatus }[]): Promise<boolean> {
    if (!trainingId) return false;
    const res = await fetch(`/api/trainings/${trainingId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao guardar presenças", description: json.error, variant: "destructive" });
      return false;
    }
    toast({ title: "Presenças guardadas" });
    await load();
    return true;
  }

  return { attendance, loading, saveAttendance, refresh: load };
}

// ─── Hook: notas de um treino ────────────────────────────

export function useTrainingNotes(trainingId: string | null) {
  const [notes, setNotes] = useState<TrainingNote[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!trainingId) { setNotes([]); return; }
    setLoading(true);
    const res = await fetch(`/api/trainings/${trainingId}/notes`);
    const json = await res.json();
    setNotes(json.notes ?? []);
    setLoading(false);
  }, [trainingId]);

  useEffect(() => { load(); }, [load]);

  async function addNote(text: string): Promise<boolean> {
    if (!trainingId) return false;
    const res = await fetch(`/api/trainings/${trainingId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_text: text }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao guardar nota", description: json.error, variant: "destructive" });
      return false;
    }
    setNotes((prev) => [...prev, json.note]);
    return true;
  }

  async function editNote(noteId: string, text: string): Promise<boolean> {
    if (!trainingId) return false;
    const res = await fetch(`/api/trainings/${trainingId}/notes/${noteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_text: text }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao editar nota", description: json.error, variant: "destructive" });
      return false;
    }
    setNotes((prev) => prev.map((n) => (n.id === noteId ? json.note : n)));
    return true;
  }

  async function deleteNote(noteId: string): Promise<boolean> {
    if (!trainingId) return false;
    const res = await fetch(`/api/trainings/${trainingId}/notes/${noteId}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: "Erro ao apagar nota", variant: "destructive" });
      return false;
    }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    return true;
  }

  return { notes, loading, addNote, editNote, deleteNote, refresh: load };
}

// ─── Hook: assiduidade dos jogadores (view Supabase) ─────

export function usePlayerAttendanceStats(seasonId: string | null) {
  const supabase = createClient();
  const [stats, setStats] = useState<Record<string, {
    total: number; present: number; absent: number;
    justified: number; late: number; pct: number;
  }>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!seasonId) { setStats({}); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from("player_attendance_stats")
      .select("*")
      .eq("season_id", seasonId);

    if (error) { console.warn("attendance stats:", error.message); }

    const map: typeof stats = {};
    for (const row of data ?? []) {
      map[row.player_id] = {
        total:     Number(row.total_trainings ?? 0),
        present:   Number(row.present   ?? 0),
        absent:    Number(row.absent    ?? 0),
        justified: Number(row.justified ?? 0),
        late:      Number(row.late      ?? 0),
        pct:       Number(row.attendance_pct ?? 0),
      };
    }
    setStats(map);
    setLoading(false);
  }, [seasonId, supabase]);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, refresh: load };
}

// ─── Hook: eventos do clube ───────────────────────────────

export function useClubEvents(seasonId: string | null) {
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!seasonId) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    const res = await fetch(`/api/club-events?season_id=${seasonId}`);
    const json = await res.json();
    setEvents(json.events ?? []);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => { load(); }, [load]);

  async function createEvent(body: Record<string, string>): Promise<boolean> {
    const res = await fetch("/api/club-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, season_id: seasonId }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Erro ao criar evento", description: json.error, variant: "destructive" });
      return false;
    }
    toast({ title: "Evento criado" });
    await load();
    return true;
  }

  async function deleteEvent(id: string): Promise<boolean> {
    const res = await fetch(`/api/club-events/${id}`, { method: "DELETE" });
    if (!res.ok) { toast({ title: "Erro ao eliminar evento", variant: "destructive" }); return false; }
    toast({ title: "Evento eliminado" });
    setEvents((prev) => prev.filter((e) => e.id !== id));
    return true;
  }

  return { events, loading, createEvent, deleteEvent, refresh: load };
}
