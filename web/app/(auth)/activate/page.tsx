"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PLATFORM_LOGO, PLATFORM_THEME as T } from "@/lib/platform-theme";

type State = "idle" | "loading" | "success" | "error";

export default function ActivatePage() {
  const [token,    setToken]    = useState<string | null>(null);
  const [state,    setState]    = useState<State>("idle");
  const [message,  setMessage]  = useState("");
  const [imgError, setImgError] = useState(false);
  const router = useRouter();

  // Lê o token do URL sem useSearchParams (evita requisito de Suspense)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  async function handleActivate() {
    if (!token) return;
    setState("loading");

    try {
      const res = await fetch("/api/activate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Ocorreu um erro. Tenta novamente.");
        return;
      }

      setState("success");
      // Redirecionar para login com mensagem de sucesso após 2.5s
      setTimeout(() => router.push("/login?activated=1"), 2500);
    } catch {
      setState("error");
      setMessage("Não foi possível contactar o servidor. Verifica a ligação e tenta novamente.");
    }
  }

  const noToken = token === null && state === "idle";
  const hasToken = token !== null;

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="space-y-4 pb-6 text-center">

        {/* Logo fixo HoopHub */}
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
          <CardTitle className="text-xl">Ativar Conta HoopHub</CardTitle>
          <CardDescription>
            Confirma a tua identidade para ativar o acesso à plataforma
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">

        {/* Estado: sem token */}
        {(noToken || (token === "" && state === "idle")) && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Link de ativação inválido. Verifica o email que recebeste e clica no botão
              &ldquo;Ativar Conta&rdquo;.
            </p>
          </div>
        )}

        {/* Estado: aguarda confirmação */}
        {hasToken && state === "idle" && (
          <>
            <div
              className="flex items-start gap-3 rounded-lg border p-4"
              style={{ borderColor: "rgba(10,26,47,0.15)", background: "rgba(10,26,47,0.03)" }}
            >
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A5F]" />
              <div className="text-sm text-muted-foreground leading-relaxed">
                Clica no botão abaixo para confirmar a ativação da tua conta.
                Após a ativação serás redirecionado para a página de login.
              </div>
            </div>

            <Button
              className="w-full font-semibold"
              style={{ backgroundColor: T.button, color: T.buttonText }}
              onClick={handleActivate}
            >
              Confirmar Ativação
            </Button>
          </>
        )}

        {/* Estado: a processar */}
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#1E3A5F]" />
            <p className="text-sm text-muted-foreground">A ativar a tua conta…</p>
          </div>
        )}

        {/* Estado: sucesso */}
        {state === "success" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div>
              <p className="font-semibold text-foreground">Conta ativada com sucesso!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A redirecionar para a página de login…
              </p>
            </div>
          </div>
        )}

        {/* Estado: erro */}
        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Não foi possível ativar</p>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => { setState("idle"); }}
            >
              Tentar novamente
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
