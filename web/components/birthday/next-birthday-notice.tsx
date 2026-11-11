"use client";

import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import type { NextBirthday } from "@/app/api/birthdays/next/route";

const PT_MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function whenLabel(days: number): string {
  if (days === 1) return "amanhã";
  return `daqui a ${days} dias`;
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${PT_MONTHS[m - 1]}`;
}

/** Aviso discreto, no fim do Dashboard, com o próximo aniversário no clube. */
export function NextBirthdayNotice() {
  const [next, setNext] = useState<NextBirthday | null>(null);

  useEffect(() => {
    fetch("/api/birthdays/next")
      .then((r) => (r.ok ? r.json() : { next: null }))
      .then((json: { next?: NextBirthday | null }) => setNext(json.next ?? null))
      .catch(() => {});
  }, []);

  if (!next) return null;

  const names = [next.name, ...next.others];
  const who = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

  return (
    <section
      aria-label="Próximo aniversário"
      className="flex items-center gap-3 rounded-[12px] px-4 py-3"
      style={{
        background: "var(--card,#fff)",
        border:     "1px solid #E7E5E4",
      }}
    >
      <Cake size={18} style={{ color: "var(--action,#F97316)", flexShrink: 0 }} />
      <p className="text-sm min-w-0" style={{ color: "#6F675F" }}>
        <span className="font-semibold" style={{ color: "#1A1612" }}>Próximo aniversário: </span>
        {who}{names.length === 1 ? ` faz ${next.turning_age} anos` : " fazem anos"}{" "}
        {whenLabel(next.days_until)} ({formatDate(next.date)}).
      </p>
    </section>
  );
}
