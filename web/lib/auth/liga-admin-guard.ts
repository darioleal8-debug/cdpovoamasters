import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type LigaAdminOk   = { ok: true;  user: User; supabase: ServerClient };
export type LigaAdminFail = { ok: false; response: NextResponse };

export async function authorizeAsLigaAdmin(): Promise<LigaAdminOk | LigaAdminFail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }

  const { data: isAdmin } = await supabase.rpc("is_liga_admin");

  if (!isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem permissão de admin da liga" }, { status: 403 }),
    };
  }

  return { ok: true, user, supabase };
}
