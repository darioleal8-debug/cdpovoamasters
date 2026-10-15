"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkPwnedPassword, PWNED_ERROR_MESSAGE } from "@/lib/pwned-password";

const FOCUS_RING =
  "focus:outline-none focus:ring-4 focus:ring-[rgba(249,115,22,.16)] focus:border-[#F97316]";

export function RedefinirPasswordForm() {
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [done,            setDone]            = useState(false);

  const router   = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 10) {
      setError("A password deve ter pelo menos 10 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As passwords não coincidem.");
      return;
    }

    setLoading(true);

    const pwnedResult = await checkPwnedPassword(newPassword);
    if (pwnedResult.pwned) {
      setError(PWNED_ERROR_MESSAGE);
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message ?? "Erro ao definir a nova password. Tenta novamente.");
        return;
      }

      setDone(true);
      // Sign out so the user authenticates fresh with the new password
      await supabase.auth.signOut();
      setTimeout(() => router.push("/login?password-reset=1"), 2000);
    } catch {
      setError("Erro inesperado. Verifica a tua ligação e tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = newPassword.length >= 10 && confirmPassword.length >= 10 && !loading;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-2xl"
        style={{ background: "#fff" }}
      >
        {/* Icon + title */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "rgba(249,115,22,.10)" }}
          >
            <KeyRound className="h-5 w-5" style={{ color: "#F97316" }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: "#0F1729" }}>
            Nova password
          </h1>
          <p className="text-center text-[13px]" style={{ color: "#5A6478" }}>
            Define a tua nova password. Usa pelo menos 10 caracteres.
          </p>
        </div>

        {/* Success state */}
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="font-semibold" style={{ color: "#0F1729" }}>
              Password definida!
            </p>
            <p className="text-[13px]" style={{ color: "#5A6478" }}>
              A redirecionar para o login…
            </p>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-xl px-4 py-3 text-sm font-medium"
                style={{
                  background: "rgba(217,45,32,.08)",
                  color: "#D92D20",
                  border: "1px solid rgba(217,45,32,.2)",
                }}
              >
                {error}
              </div>
            )}

            {/* New password */}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="new-password"
                className="text-sm font-semibold"
                style={{ color: "#0F1729" }}
              >
                Nova password
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  placeholder="Mínimo 10 caracteres"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className={`h-[52px] text-sm rounded-xl border px-4 pr-12 ${FOCUS_RING}`}
                  style={{ borderColor: "#E4E7EE" }}
                />
                <button
                  type="button"
                  aria-pressed={showNew}
                  aria-label={showNew ? "Ocultar password" : "Mostrar password"}
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                  style={{ color: "#5A6478" }}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="confirm-password"
                className="text-sm font-semibold"
                style={{ color: "#0F1729" }}
              >
                Confirmar password
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repete a nova password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className={`h-[52px] text-sm rounded-xl border px-4 pr-12 ${FOCUS_RING}`}
                  style={{ borderColor: "#E4E7EE" }}
                />
                <button
                  type="button"
                  aria-pressed={showConfirm}
                  aria-label={showConfirm ? "Ocultar password" : "Mostrar password"}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                  style={{ color: "#5A6478" }}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={loading}
              className="h-[54px] w-full rounded-xl text-[15px] font-semibold text-white transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "#F97316" }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "A guardar…" : "Definir nova password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
