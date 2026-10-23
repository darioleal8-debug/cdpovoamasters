"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

export default function RedefinirPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPwd.length < 8) {
      setError("A palavra-passe tem de ter pelo menos 8 caracteres.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPwd,
        data: { must_change_password: false },
      });
      if (updateErr) {
        setError("Erro ao redefinir a palavra-passe. O link pode ter expirado.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/liga-inatel/equipa/login"), 2500);
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

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F2EC", padding: "24px 16px" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "16px", fontWeight: 700, color: "#16A34A", marginBottom: "8px" }}>Palavra-passe redefinida!</p>
          <p style={{ fontSize: "13px", color: "#6F675F" }}>A redirecionar para o login…</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F6F2EC", padding: "24px 16px" }}>
        <p style={{ fontSize: "13px", color: "#6F675F" }}>A verificar link de recuperação…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F6F2EC", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: "400px", background: "#fff", borderRadius: "16px", border: "1px solid #E8E0D4", padding: "32px 28px", boxShadow: "0 2px 16px rgba(0,0,0,.06)" }}>

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <p style={{ fontFamily: "var(--font-ibm-mono, monospace)", fontSize: "10px", fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#F97316", marginBottom: "8px" }}>
            LIGA INATEL
          </p>
          <h1 style={{ fontFamily: "var(--font-bc-heavy, sans-serif)", fontWeight: 800, fontSize: "22px", letterSpacing: ".04em", textTransform: "uppercase", color: "#15110E", margin: "0 0 4px" }}>
            Nova Palavra-passe
          </h1>
          <p style={{ fontSize: "13px", color: "#6F675F", margin: 0 }}>
            Define a tua nova palavra-passe de acesso
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
              Confirmar palavra-passe
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
            disabled={loading || !newPwd || !confirmPwd}
            style={{
              width: "100%", padding: "12px", marginTop: "4px",
              background: (loading || !newPwd || !confirmPwd) ? "#D1C9C0" : "#F97316",
              color: "#fff", fontSize: "14px", fontWeight: 700,
              letterSpacing: ".04em", textTransform: "uppercase",
              border: "none", borderRadius: "8px",
              cursor: (loading || !newPwd || !confirmPwd) ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "A guardar…" : "Guardar"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "#6F675F" }}>
          <Link href="/liga-inatel/equipa/login" style={{ color: "#F97316", textDecoration: "none" }}>
            ← Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}
