"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError(
        authError.message.includes("Invalid")
          ? "Email ou password incorretos."
          : "Não foi possível autenticar. Tenta novamente."
      );
      setLoading(false);
      return;
    }

    toast({ title: "Bem-vindo de volta!" });
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="space-y-3 pb-6 text-center">
        {/* Logótipo */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-800 text-base font-bold text-white shadow-lg ring-2 ring-white">
          CDP
        </div>
        <div>
          <CardTitle className="text-xl">Área Privada</CardTitle>
          <CardDescription>
            Introduz as tuas credenciais para aceder ao painel de gestão
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="o.teu@email.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
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
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar password" : "Mostrar password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !email || !password}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "A autenticar..." : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/"
            className="hover:text-foreground hover:underline"
          >
            ← Voltar ao site público
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
