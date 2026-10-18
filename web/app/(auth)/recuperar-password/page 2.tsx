"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Recuperação de palavra-passe (UX-02). A resposta é sempre a mesma, exista ou não a conta
// (não revela que emails estão registados).
const SENT_MESSAGE =
  "Se existir uma conta com este email, vais receber um link para definires uma nova palavra-passe. Verifica também o spam.";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/alterar-password`,
    });
    if (error) console.warn("[recuperar-password]", error.message); // mesma resposta ao utilizador
    setSending(false);
    setSent(true);
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Recuperar palavra-passe</h1>
          <p className="text-sm text-muted-foreground">
            Indica o email da tua conta e enviamos-te um link para definires uma nova palavra-passe.
          </p>
        </div>

        {sent ? (
          <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">{SENT_MESSAGE}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="o.teu@email.com"
              />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar link
            </Button>
          </form>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="font-medium underline-offset-4 hover:underline">Voltar ao login</Link>
        </p>
      </div>
    </main>
  );
}
