"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter }     from "next/navigation";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { createClient }  from "@/lib/supabase/client";
import { Input }         from "@/components/ui/input";
import { Label }         from "@/components/ui/label";

const FOCUS_RING = "focus:outline-none focus:ring-4 focus:ring-[rgba(249,115,22,.16)] focus:border-[#F97316]";

export function LoginForm() {
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [justActivated,setJustActivated]= useState(false);
  const [attempts,     setAttempts]     = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  const router   = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("activated") === "1")
      setJustActivated(true);
  }, []);

  // Move foco para o resumo de erro quando aparece
  useEffect(() => {
    if (error && errorRef.current) errorRef.current.focus();
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    try {
      let authErr: { message: string } | null = null;
      let authUser: { id: string } | null = null;

      for (let i = 0; i < 3; i++) {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        authUser = data?.user ?? null;
        authErr  = err;
        if (!err || !/network|fetch/i.test(err.message)) break;
        if (i < 2) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }

      if (authErr || !authUser) {
        const base = authErr?.message.includes("Invalid")
          ? "Email ou palavra-passe incorretos."
          : `Não foi possível autenticar. (${authErr?.message ?? "resposta inválida"})`;
        const remaining = Math.max(0, 5 - newAttempts);
        setError(base + (remaining > 0 && newAttempts >= 2 ? ` ${plural(remaining, "tentativa restante", "tentativas restantes")}.` : ""));
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("users").select("active, must_change_password").eq("id", authUser.id).single();

      if (profile?.active === false) {
        await supabase.auth.signOut();
        setError("A tua conta ainda não está ativada. Verifica o teu email para o link de ativação.");
        setLoading(false);
        return;
      }

      if (profile?.must_change_password) {
        router.push("/alterar-password");
        router.refresh();
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(`Erro inesperado. Tenta novamente. (${err instanceof Error ? err.message : "desconhecido"})`);
      setLoading(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

      {/* Sucesso de ativação */}
      {justActivated && !error && (
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
          style={{ background: "rgba(18,133,91,.08)", color: "var(--ok, #12855B)", border: "1px solid rgba(18,133,91,.2)" }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Conta ativada! Podes entrar.
        </div>
      )}

      {/* Resumo de erros — aria-live + tabIndex para foco */}
      {error && (
        <div
          ref={errorRef}
          role="alert"
          aria-live="polite"
          tabIndex={-1}
          className="rounded-xl px-4 py-3 text-sm font-medium outline-none"
          style={{ background: "rgba(217,45,32,.08)", color: "var(--bad, #D92D20)", border: "1px solid rgba(217,45,32,.2)" }}
        >
          {error}
        </div>
      )}

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-sm font-semibold" style={{ color: "var(--text, #0F1729)" }}>
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
          style={{ borderColor: "var(--line, #E4E7EE)" }}
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-sm font-semibold" style={{ color: "var(--text, #0F1729)" }}>
            Palavra-passe
          </Label>
          <a
            href="/recuperar-password"
            className="text-[13px] font-medium transition-colors hover:underline"
            style={{ color: "var(--action-ink, #C2410C)" }}
          >
            Esqueci-me
          </a>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className={`h-[52px] text-sm rounded-xl border px-4 pr-12 ${FOCUS_RING}`}
            style={{ borderColor: "var(--line, #E4E7EE)" }}
          />
          <button
            type="button"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--muted-text, #5A6478)" }}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Manter sessão */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded"
          style={{ accentColor: "var(--action, #F97316)" }}
        />
        <span className="text-[13px]" style={{ color: "var(--muted-text, #5A6478)" }}>
          Manter sessão neste dispositivo
        </span>
      </label>

      {/* Botão primário */}
      <button
        type="submit"
        disabled={!canSubmit}
        aria-busy={loading}
        className="h-[54px] w-full rounded-xl text-[15px] font-semibold text-white transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: canSubmit ? "var(--action, #F97316)" : "var(--action, #F97316)" }}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "A entrar…" : "Entrar no painel"}
      </button>

      {/* Rodapé */}
      <p className="text-center text-[13px]" style={{ color: "var(--muted-text, #5A6478)" }}>
        Novo no clube?{" "}
        <span className="font-semibold" style={{ color: "var(--text, #0F1729)" }}>
          Pede acesso ao treinador — ele aprova.
        </span>
      </p>
    </form>
  );
}

function plural(n: number, s: string, p: string) {
  return n === 1 ? `${n} ${s}` : `${n} ${p}`;
}
