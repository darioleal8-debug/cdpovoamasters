/**
 * Nome de um jogador para os ecrãs do live: primeiro + último nome ("Rui Teste"),
 * nunca só o primeiro. Nomes de uma só palavra ficam como estão.
 */
export function liveName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
