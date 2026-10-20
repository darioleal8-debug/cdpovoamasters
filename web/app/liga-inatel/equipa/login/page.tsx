"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

function DelegateLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("msg") === "admin_required") {
      setError("Não tens permissão para aceder à área de admin.");
    }
  }, [searchParams]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Credenciais inválidas. Verifique o email e palavra-passe.");
        return;
      }

      const res = await fetch("/api/liga/auth/set-cookie", { method: "POST" });
      if (!res.ok) {
        await supabase.auth.signOut();
        setError("Esta conta não tem acesso à liga. Contacte o administrador.");
        return;
      }

      const json = await res.json();
      if (json.role === "liga_admin") {
        router.push("/liga-inatel/admin");
      } else {
        router.push("/liga-inatel/equipa");
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg, #F6F2EC)",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "var(--card, #fff)",
          borderRadius: "16px",
          border: "1px solid var(--border, #E8E0D4)",
          padding: "32px 28px",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <p
            style={{
              fontFamily: "var(--font-ibm-mono, monospace)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#F97316",
              marginBottom: "8px",
            }}
          >
            LIGA INATEL
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bc-heavy, sans-serif)",
              fontWeight: 800,
              fontSize: "26px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--fg, #15110E)",
              margin: "0 0 4px",
            }}
          >
            Acesso de Delegado
          </h1>
          <p style={{ fontSize: "13px", color: "var(--muted, #6F675F)", margin: 0 }}>
            Inicia sessão para gerir a tua equipa
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label
              htmlFor="email"
              style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted, #6F675F)", marginBottom: "5px" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="delegado@equipa.pt"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1.5px solid var(--border, #E8E0D4)",
                borderRadius: "8px",
                background: "var(--bg, #F6F2EC)",
                color: "var(--fg, #15110E)",
                outline: "none",
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted, #6F675F)", marginBottom: "5px" }}
            >
              Palavra-passe
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1.5px solid var(--border, #E8E0D4)",
                borderRadius: "8px",
                background: "var(--bg, #F6F2EC)",
                color: "var(--fg, #15110E)",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <p
              style={{
                fontSize: "13px",
                color: "#DC2626",
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                borderRadius: "8px",
                padding: "10px 12px",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: "100%",
              padding: "12px",
              marginTop: "4px",
              background: loading ? "#D1C9C0" : "#F97316",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              border: "none",
              borderRadius: "8px",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "A entrar…" : "Entrar"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "var(--muted, #6F675F)" }}>
          <Link href="/liga-inatel" style={{ color: "#F97316", textDecoration: "none" }}>
            ← Voltar à Liga INATEL
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function DelegateLoginPage() {
  return (
    <Suspense>
      <DelegateLoginContent />
    </Suspense>
  );
}
