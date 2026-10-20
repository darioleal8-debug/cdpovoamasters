"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DelegateSignOut() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch("/api/liga/auth/signout", { method: "POST" });
      router.push("/liga-inatel/equipa/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      style={{
        padding: "7px 14px",
        fontSize: "12px",
        fontWeight: 600,
        color: "#9A8F84",
        background: "transparent",
        border: "1px solid #2A3240",
        borderRadius: "7px",
        cursor: loading ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {loading ? "A sair…" : "Terminar sessão"}
    </button>
  );
}
