/** Calcula a idade em anos a partir de uma data de nascimento (YYYY-MM-DD). */
export function calculateAge(birthDate: string): number {
  const today = new Date();
  const dob   = new Date(birthDate + "T00:00:00");
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/** Devolve uma string "X anos" ou "" se birthDate for nulo/inválido. */
export function ageLabel(birthDate: string | null | undefined): string {
  if (!birthDate) return "";
  try {
    const age = calculateAge(birthDate);
    if (age < 0 || age > 120) return "";
    return `${age} anos`;
  } catch {
    return "";
  }
}
