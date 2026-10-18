/**
 * Duração do ban no Supabase Auth ao (des)ativar uma conta. Desativar só em public.users não basta:
 * a sessão existente continuaria a renovar-se. ~100 anos = permanente até reativação.
 */
export function banDurationFor(active: boolean): string {
  return active ? "none" : "876000h";
}
