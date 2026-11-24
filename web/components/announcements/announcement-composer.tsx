"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { formatCivilDate } from "@/lib/announcements/format";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from "@/lib/announcements/types";

type Kind = "general" | "game" | "training";

interface GameOpt { id: string; title: string; opponent: string | null; competition: string | null; event_date: string; event_time: string | null }
interface TrainingOpt { id: string; date: string; start_time: string | null; end_time: string | null; type: string | null }

const KINDS: Array<{ v: Kind; label: string }> = [
  { v: "general",  label: "Geral" },
  { v: "game",     label: "Jogo" },
  { v: "training", label: "Treino" },
];

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Formulário de publicação (só admin e treinador). Publicar notifica os jogadores. */
export function AnnouncementComposer({ onPublished }: { onPublished: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Kind>("general");
  const [targetId, setTargetId] = useState("");
  const [games, setGames] = useState<GameOpt[] | null>(null);
  const [trainings, setTrainings] = useState<TrainingOpt[] | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Jogos/treinos só são pedidos quando se escolhe afetar a um deles
  useEffect(() => {
    if (kind === "general" || (games && trainings)) return;
    let cancelled = false;
    setLoadingTargets(true);
    fetch("/api/announcements/targets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { games: GameOpt[]; trainings: TrainingOpt[] }) => { if (!cancelled) { setGames(d.games); setTrainings(d.trainings); } })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar os jogos e treinos."); })
      .finally(() => { if (!cancelled) setLoadingTargets(false); });
    return () => { cancelled = true; };
  }, [kind, games, trainings]);

  const options = kind === "game" ? games : kind === "training" ? trainings : null;
  const canSubmit = title.trim() && body.trim() && (kind === "general" || targetId) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, body,
          target: kind === "general" ? null : { type: kind, id: targetId },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Não foi possível publicar."); return; }
      setTitle(""); setBody(""); setKind("general"); setTargetId("");
      toast({ title: "Comunicado publicado", description: "Os jogadores vão receber uma notificação." });
      onPublished();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3"
      style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
    >
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-label" style={{ color: "var(--muted-text,#5A6478)" }}>
        <Megaphone className="h-4 w-4" aria-hidden /> Novo comunicado
      </p>

      <Input
        value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ANNOUNCEMENT_TITLE_MAX}
        placeholder="Título" aria-label="Título do comunicado"
      />
      <div>
        <Textarea
          value={body} onChange={(e) => setBody(e.target.value)} maxLength={ANNOUNCEMENT_BODY_MAX} rows={5}
          placeholder="Escreve o comunicado…" aria-label="Texto do comunicado"
        />
        <p className="mt-1 text-right text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>
          {body.length}/{ANNOUNCEMENT_BODY_MAX}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[12px] font-semibold" style={{ color: "var(--text,#0A1220)" }}>Afeto a</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Afeto a">
          {KINDS.map(({ v, label }) => (
            <button
              key={v} type="button" role="radio" aria-checked={kind === v}
              onClick={() => { setKind(v); setTargetId(""); }}
              className="h-9 rounded-lg px-4 text-[13px] font-semibold"
              style={{
                background: kind === v ? "var(--ink,#0A1220)" : "transparent",
                color: kind === v ? "#fff" : "var(--text,#0A1220)",
                border: "1px solid var(--line,#E4E7EE)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {kind !== "general" && (
          loadingTargets ? (
            <p className="text-[12px]" style={{ color: "var(--muted-text,#5A6478)" }}>A carregar…</p>
          ) : options && options.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--muted-text,#5A6478)" }}>
              Não há {kind === "game" ? "jogos" : "treinos"} agendados nos próximos 90 dias.
            </p>
          ) : (
            <select
              value={targetId} onChange={(e) => setTargetId(e.target.value)}
              aria-label={kind === "game" ? "Jogo" : "Treino"}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{kind === "game" ? "Escolhe o jogo…" : "Escolhe o treino…"}</option>
              {kind === "game" && (games ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {[g.opponent ? `vs ${g.opponent}` : g.title, formatCivilDate(g.event_date), hhmm(g.event_time), g.competition].filter(Boolean).join(" · ")}
                </option>
              ))}
              {kind === "training" && (trainings ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {[formatCivilDate(t.date), hhmm(t.start_time)].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          )
        )}
        <p className="text-[11px]" style={{ color: "var(--muted-text,#5A6478)" }}>
          {kind === "general"
            ? "Fica em destaque no Dashboard durante 72 horas."
            : "Fica em destaque no Dashboard até ao final do jogo/treino."}
        </p>
      </fieldset>

      {error && <p role="alert" className="text-[13px] font-semibold text-destructive">{error}</p>}

      <button
        type="submit" disabled={!canSubmit}
        className="h-10 self-start rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50"
        style={{ background: "var(--action,#F97316)" }}
      >
        {busy ? "A publicar…" : "Publicar e notificar"}
      </button>
    </form>
  );
}
