"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { useSeasons } from "@/hooks/use-seasons";

interface Props {
  /** Nº de jogadores (contas de jogador com perfil) na temporada ativa. */
  playersCount: number;
  /** Mostrar também quando os passos já estão todos feitos (por omissão não mostra nada). */
  alwaysShow?: boolean;
}

interface Step {
  id:      string;
  title:   string;
  hint:    string;
  done:    boolean;
  href:    string;
  action:  string;
  /** Só pode ser feito depois do passo anterior. */
  locked:  boolean;
}

/**
 * Passos essenciais para um clube novo poder usar a app, pela ordem certa:
 * 1) criar a temporada, 2) ativá-la, 3) criar as contas dos jogadores do plantel.
 * (Um jogador do plantel só existe ligado a uma conta — não há outra forma de o criar.)
 */
export function SetupChecklist({ playersCount, alwaysShow = false }: Props) {
  const { seasons, activeSeason, loading } = useSeasons();
  if (loading) return null;

  const hasSeason  = seasons.length > 0;
  const hasActive  = !!activeSeason;
  const hasPlayers = playersCount > 0;

  const steps: Step[] = [
    {
      id: "season", title: "Criar a temporada",
      hint: "Define o nome e as datas da época. Tudo (plantel, jogos, treinos) fica associado a uma temporada.",
      done: hasSeason, href: "/temporadas", action: "Criar temporada", locked: false,
    },
    {
      id: "activate", title: "Ativar a temporada",
      hint: "A temporada ativa é a que o painel, o plantel e os jogos usam por defeito.",
      done: hasActive, href: "/temporadas", action: "Ativar temporada", locked: !hasSeason,
    },
    {
      id: "players", title: "Criar os jogadores do plantel (conta + dados desportivos)",
      hint: "Cada jogador é criado através da sua conta: nome, email, telemóvel, data de nascimento, número e posição. Recebe um link para ativar a conta.",
      done: hasPlayers, href: "/jogadores?novo=1", action: "Criar conta de jogador", locked: !hasActive,
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone && !alwaysShow) return null;

  const next = steps.find((s) => !s.done);

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
      aria-label="Primeiros passos"
    >
      <h2 className="font-condensed text-xl font-bold uppercase tracking-display" style={{ color: "var(--text,#0A1220)" }}>
        Primeiros passos
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted-text,#5A6478)" }}>
        Faz estes passos pela ordem para começares a usar a app com o teu clube.
      </p>

      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => {
          const isNext = next?.id === s.id;
          return (
            <li key={s.id} className="flex items-start gap-3" style={{ opacity: s.locked ? 0.55 : 1 }}>
              {s.done
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--ok,#12855B)" }} />
                : <Circle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--muted-text,#5A6478)" }} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--text,#0A1220)" }}>
                  {i + 1}. {s.title}
                </p>
                {!s.done && (
                  <p className="mt-0.5 text-[13px]" style={{ color: "var(--muted-text,#5A6478)" }}>{s.hint}</p>
                )}
                {isNext && !s.locked && (
                  <Link
                    href={s.href}
                    className="mt-2 inline-flex h-9 items-center rounded-xl px-4 text-sm font-semibold"
                    style={{ background: "var(--club-secondary,#F28C28)", color: "var(--club-secondary-fg,#fff)" }}
                  >
                    {s.action}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
