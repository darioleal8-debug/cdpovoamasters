"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

export default function ContaPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/liga-inatel/equipa/login");
        return;
      }
      setUserEmail(user.email ?? "");
      setMustChange(user.user_metadata?.must_change_password === true);
      setChecking(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPwd.length < 8) {
      setError("A nova palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    setLoading(true);
    try {
      // Re-autenticar para confirmar palavra-passe atual
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPwd,
      });
      if (signInErr) {
        setError("Palavra-passe atual incorreta.");
        return;
      }

      // Atualizar password e limpar flag must_change_password
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPwd,
        data: { must_change_password: false },
      });
      if (updateErr) {
        setError("Erro ao atualizar a palavra-passe. Tenta novamente.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/liga-inatel/equipa"), 2000);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1.5px solid #E8E0D4",
    borderRadius: "8px",
    background: "#F6F2EC",
    color: "#15110E",
    outline: "none",
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F2EC" }}>
        <p style={{ color: "#6F675F", fontSize: "14px" }}>A verificar sessão…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F6F2EC", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "400px", background: "#fff", borderRadius: "16px", border: "1px solid #E8E0D4", padding: "32px 28px", boxShadow: "0 2px 16px rgba(0,0,0,.06)" }}>

        {mustChange && !success && (
          <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: "8px", padding: "12px 14px", marginBottom: "20px", fontSize: "13px", color: "#92400E", lineHeight: 1.5 }}>
            Por segurança, define uma nova palavra-passe pessoal antes de continuar.
          </div>
        )}

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <p style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#F97316", marginBottom: "8px" }}>
            LIGA INATEL
          </p>
          <h1 style={{ fontFamily: "var(--font-bc-heavy, sans-serif)", fontWeight: 800, fontSize: "22px", letterSpacing: ".04em", textTransform: "uppercase", color: "#15110E", margin: "0 0 4px" }}>
            Alterar Palavra-passe
          </h1>
          <p style={{ fontSize: "12px", color: "#6F675F", margin: 0 }}>{userEmail}</p>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <p style={{ fontSize: "15px", color: "#16A34A", fontWeight: 700, marginBottom: "8px" }}>
              Palavra-passe alterada!
            </p>
            <p style={{ fontSize: "13px", color: "#6F675F" }}>A redirecionar…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label htmlFor="current" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6F675F", marginBottom: "5px" }}>
                Palavra-passe atual
              </label>
              <input id="current" type="password" required autoComplete="current-password"
                value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
                placeholder="••••••••" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="new-pwd" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6F675F", marginBottom: "5px" }}>
                Nova palavra-passe
              </label>
              <input id="new-pwd" type="password" required autoComplete="new-password"
                value={newPwd} onChange={e => setNewPwd(e.target.value)}
                placeholder="Mínimo 8 caracteres" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="confirm-pwd" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6F675F", marginBottom: "5px" }}>
                Confirmar nova palavra-passe
              </label>
              <input id="confirm-pwd" type="password" required autoComplete="new-password"
                value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Repetir palavra-passe" style={inputStyle} />
            </div>

            {error && (
              <p style={{ fontSize: "13px", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "10px 12px", margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !currentPwd || !newPwd || !confirmPwd}
              style={{
                width: "100%", padding: "12px", marginTop: "4px",
                background: (loading || !currentPwd || !newPwd || !confirmPwd) ? "#D1C9C0" : "#F97316",
                color: "#fff", fontSize: "14px", fontWeight: 700,
                letterSpacing: ".04em", textTransform: "uppercase",
                border: "none", borderRadius: "8px",
                cursor: (loading || !currentPwd || !newPwd || !confirmPwd) ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "A guardar…" : "Guardar palavra-passe"}
            </button>
          </form>
        )}

        {!mustChange && !success && (
          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "#6F675F" }}>
            <Link href="/liga-inatel/equipa" style={{ color: "#F97316", textDecoration: "none" }}>
              ← Voltar à área de equipa
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
