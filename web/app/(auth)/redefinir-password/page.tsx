import type { Metadata } from "next";
import Link from "next/link";
import { XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RedefinirPasswordForm } from "./form";

export const metadata: Metadata = {
  title: "Nova password — hoophub",
  robots: { index: false, follow: false },
};

export default async function RedefinirPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No valid session — link expired, already used, or navigated directly
  if (!user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-2xl p-8 shadow-2xl text-center"
          style={{ background: "#fff" }}
        >
          <div className="flex flex-col items-center gap-3 py-4">
            <XCircle className="h-10 w-10 text-red-500" />
            <p className="text-lg font-bold" style={{ color: "#0F1729" }}>
              Link inválido ou expirado
            </p>
            <p className="text-[13px]" style={{ color: "#5A6478" }}>
              O link de recuperação já expirou ou foi utilizado. Pede um novo email de recuperação.
            </p>
            <Link
              href="/recuperar-password"
              className="mt-2 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white"
              style={{ background: "#F97316" }}
            >
              Pedir novo link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <RedefinirPasswordForm />;
}
