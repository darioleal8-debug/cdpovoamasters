"use client";

import { TeamKitEditor } from "./team-kit-editor";

interface Props {
  teamName: string;
  logoUrl: string | null;
  initialPrimaryColor: string | null;
  initialSecondaryColor: string | null;
}

export function DelegateKitEditor({ teamName, logoUrl, initialPrimaryColor, initialSecondaryColor }: Props) {
  async function handleSave(data: { primary_color: string | null; secondary_color: string | null }) {
    const res = await fetch("/api/liga/equipa/kit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primary_color: data.primary_color,
        secondary_color: data.secondary_color,
      }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) return { error: json.error ?? "Erro ao guardar" };
    return {};
  }

  return (
    <TeamKitEditor
      teamName={teamName}
      logoUrl={logoUrl}
      initialPrimaryColor={initialPrimaryColor}
      initialSecondaryColor={initialSecondaryColor}
      onSave={handleSave}
    />
  );
}
