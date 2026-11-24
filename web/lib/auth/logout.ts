import { createClient } from "@/lib/supabase/client";
import { unsubscribeThisDevice } from "@/lib/push/client";

/**
 * Termina a sessão de forma robusta (telemóvel incluído).
 * Tenta o signOut local no browser mas nunca fica preso nele (limite de 1,5 s);
 * depois navega para a rota do servidor, que limpa os cookies e vai para /login.
 */
export async function logout(): Promise<void> {
  // Ainda com sessão: este dispositivo deixa de receber as notificações desta conta (no máx. 1 s)
  await Promise.race([unsubscribeThisDevice(), new Promise((resolve) => setTimeout(resolve, 1000))]);
  try {
    await Promise.race([
      createClient().auth.signOut({ scope: "local" }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // a rota do servidor trata de limpar a sessão
  }
  window.location.assign("/api/auth/signout");
}
