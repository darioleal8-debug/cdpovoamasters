"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { PLATFORM_LOGO, PLATFORM_THEME as T } from "@/lib/platform-theme";

export default function LoginPage() {
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [imgError, setImgError]         = useState(false);
  const [justActivated, setJustActivated] = useState(false);

  const router   = useRouter();
  const supabase = createClient();

  // Mensagem de sucesso após ativação (via ?activated=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("activated") === "1") setJustActivated(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | undefined;
      let authError: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"] | undefined;

      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        data = result.data;
        authError = result.error;

        const isNetworkError = authError && /network|fetch/i.test(authError.message);
        if (!isNetworkError) break;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }

      if (authError || !data?.user) {
        console.error("[login] signInWithPassword error:", authError);
        setError(
          authError?.message.includes("Invalid")
            ? "Email ou password incorretos."
            : `Não foi possível autenticar. Tenta novamente. (${authError?.message ?? "resposta inválida"})`
        );
        setLoading(false);
        return;
      }

      // Verificar se a conta está ativa (jogadores precisam de ativar via email)
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("active")
        .eq("id", data.user.id)
        .single();

      if (profileError) {
        console.error("[login] profile fetch error:", profileError);
      }

      if (profile?.active === false) {
        await supabase.auth.signOut();
        setError("A tua conta ainda não está ativada. Verifica o teu email para o link de ativação.");
        setLoading(false);
        return;
      }

      toast({ title: "Bem-vindo de volta!" });
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("[login] unexpected error:", err);
      setError(`Não foi possível autenticar. Tenta novamente. (${err instanceof Error ? err.message : "erro desconhecido"})`);
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="space-y-4 pb-6 text-center">

        {/* Logótipo fixo da plataforma */}
        <div className="mx-auto mb-1">
          {!imgError ? (
            <div className="relative mx-auto h-16 w-[160px]">
              <Image
                src={PLATFORM_LOGO}
                alt="HoopHub"
                fill
                sizes="160px"
                className="object-contain"
                priority
                onError={() => setImgError(true)}
              />
            </div>
          ) : (
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg ring-2 ring-white/20"
              style={{ backgroundColor: T.button }}
            >
              CDP
            </div>
          )}
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

          {justActivated && !error && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 border border-green-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Conta ativada com sucesso! Podes fazer login.
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full font-semibold transition-opacity hover:opacity-90"
            disabled={loading || !email || !password}
            style={{ backgroundColor: T.button, color: T.buttonText }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "A autenticar..." : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline">
            ← Voltar ao site público
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
