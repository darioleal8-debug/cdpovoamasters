"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FOCUS_RING =
  "focus:outline-none focus:ring-4 focus:ring-[rgba(249,115,22,.16)] focus:border-[#F97316]";

export default function RecuperarPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // redirectTo must be in Supabase project's allowed Redirect URLs list
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/redefinir-password`,
      });
      // Always show success — never reveal whether email exists
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-2xl"
        style={{ background: "#fff" }}
      >
        {/* Back link */}
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: "#5A6478" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao login
        </Link>

        {/* Icon + title */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "rgba(249,115,22,.10)" }}
          >
            <Mail className="h-5 w-5" style={{ color: "#F97316" }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: "#0F1729" }}>
            Recuperar password
          </h1>
          <p className="text-center text-[13px]" style={{ color: "#5A6478" }}>
            Introduz o teu email e receberás um link para definires uma nova password.
          </p>
        </div>

        {/* Success state */}
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="font-semibold" style={{ color: "#0F1729" }}>
              Email enviado!
            </p>
            <p className="text-[13px]" style={{ color: "#5A6478" }}>
              Se esse endereço tiver uma conta no hoophub, receberás o link de
              recuperação em breve. Verifica também a pasta de spam.
            </p>
            <Link
              href="/login"
              className="mt-2 text-[13px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: "#B26016" }}
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-semibold"
                style={{ color: "#0F1729" }}
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="o.teu@email.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className={`h-[52px] text-sm rounded-xl border px-4 ${FOCUS_RING}`}
                style={{ borderColor: "#E4E7EE" }}
              />
            </div>

            <button
              type="submit"
              disabled={!email.trim() || loading}
              aria-busy={loading}
              className="h-[54px] w-full rounded-xl text-[15px] font-semibold text-white transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "#F97316" }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "A enviar…" : "Enviar link de recuperação"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
