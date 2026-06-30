import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Calendar, CreditCard, Dumbbell, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export const metadata = { title: "Minha Área" };

export default async function MinhaAreaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, role")
    .eq("id", user.id)
    .single();

  const { data: nextGames } = await supabase
    .from("events")
    .select("id, title, event_date, event_time, location, type")
    .eq("type", "jogo")
    .gte("event_date", new Date().toISOString().slice(0, 10))
    .order("event_date", { ascending: true })
    .limit(3);

  const { data: nextTrainings } = await supabase
    .from("trainings")
    .select("id, title, training_date, start_time, location")
    .gte("training_date", new Date().toISOString().slice(0, 10))
    .order("training_date", { ascending: true })
    .limit(3);

  const name = profile?.name || user.email || "Jogador";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Olá, {name.split(" ")[0]}!</h1>
        <p className="text-muted-foreground">Bem-vindo à tua área pessoal.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/player/meu-perfil",      icon: User,       label: "O Meu Perfil",       desc: "Ver e editar" },
          { href: "/player/meus-jogos",      icon: Calendar,   label: "Os Meus Jogos",      desc: "Próximos jogos" },
          { href: "/player/meus-treinos",    icon: Dumbbell,   label: "Os Meus Treinos",    desc: "Agenda de treinos" },
          { href: "/player/meus-pagamentos", icon: CreditCard, label: "Os Meus Pagamentos", desc: "Quotas" },
        ].map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--club-bg, #eeeeee)", color: "var(--club-primary, #111111)" }}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {(nextGames ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Próximos Jogos</h2>
          <div className="space-y-2">
            {(nextGames ?? []).map((g) => (
              <Card key={g.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "var(--club-bg, #eeeeee)", color: "var(--club-primary, #111111)" }}>
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{g.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(g.event_date).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" })}
                      {g.event_time ? ` · ${g.event_time.slice(0, 5)}h` : ""}
                      {g.location ? ` · ${g.location}` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(nextTrainings ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Próximos Treinos</h2>
          <div className="space-y-2">
            {(nextTrainings ?? []).map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "var(--club-bg, #eeeeee)", color: "var(--club-primary, #111111)" }}>
                    <Dumbbell className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{t.title ?? "Treino"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.training_date).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" })}
                      {t.start_time ? ` · ${t.start_time.slice(0, 5)}h` : ""}
                      {t.location ? ` · ${t.location}` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
