import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Clock, Dumbbell, MapPin, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Os Meus Treinos" };

type Training = { id: string; date: string; start_time?: string; end_time?: string; location?: string; type?: string; notes?: string };
type CoachNote = { id: string; training_id: string; note_text: string };

export default async function MeusTreinosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: season } = await supabase
    .from("seasons").select("id").eq("status", "ativa").maybeSingle();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: upcoming }, { data: past }] = season
    ? await Promise.all([
        supabase.from("trainings").select("id, date, start_time, end_time, location, type, notes")
          .eq("season_id", season.id).gte("date", today).order("date", { ascending: true }).limit(20),
        supabase.from("trainings").select("id, date, start_time, end_time, location, type, notes")
          .eq("season_id", season.id).lt("date", today).order("date", { ascending: false }).limit(10),
      ])
    : [{ data: [] }, { data: [] }];

  const trainingIds = [...(upcoming ?? []), ...(past ?? [])].map((t) => t.id);
  const { data: coachNotes } = trainingIds.length
    ? await supabase.from("training_notes").select("id, training_id, note_text")
        .in("training_id", trainingIds).order("created_at", { ascending: true })
    : { data: [] as CoachNote[] };

  const notesByTraining = new Map<string, CoachNote[]>();
  for (const n of (coachNotes ?? []) as CoachNote[]) {
    const list = notesByTraining.get(n.training_id) ?? [];
    list.push(n);
    notesByTraining.set(n.training_id, list);
  }

  function TrainingCard({ t, isPast = false }: { t: Training; isPast?: boolean }) {
    const notes = notesByTraining.get(t.id) ?? [];
    return (
      <Card className={isPast ? "opacity-70" : ""}>
        <CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--club-bg, #eeeeee)", color: "var(--club-primary, #111111)" }}>
            <Dumbbell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Treino</p>
              {t.type && <Badge variant="outline" className="text-[10px] capitalize">{t.type}</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Dumbbell className="h-3 w-3" />
                {new Date(t.date).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              {t.start_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.start_time.slice(0, 5)}{t.end_time ? `–${t.end_time.slice(0, 5)}` : ""}h</span>}
              {t.location   && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{t.location}</span>}
            </div>
            {t.notes && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{t.notes}</p>}
            {notes.length > 0 && (
              <div className="mt-2 space-y-1.5 border-t pt-2">
                <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <FileText className="h-3 w-3" /> Notas do treinador
                </p>
                {notes.map((n) => (
                  <p key={n.id} className="text-xs whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1.5">
                    {n.note_text}
                  </p>
                ))}
              </div>
            )}
          </div>
          {isPast && <Badge variant="secondary" className="shrink-0 text-[10px]">Terminado</Badge>}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Os Meus Treinos</h1>
        <p className="text-muted-foreground">Agenda de treinos da equipa.</p>
      </div>
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Próximos Treinos</h2>
        {(upcoming ?? []).length === 0
          ? <p className="text-sm text-muted-foreground">Sem treinos agendados.</p>
          : <div className="space-y-2">{(upcoming as Training[]).map((t) => <TrainingCard key={t.id} t={t} />)}</div>}
      </div>
      {(past ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">Treinos Anteriores</h2>
          <div className="space-y-2">{(past as Training[]).map((t) => <TrainingCard key={t.id} t={t} isPast />)}</div>
        </div>
      )}
    </div>
  );
}
