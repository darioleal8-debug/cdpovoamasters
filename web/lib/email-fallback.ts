export interface NoServiceResult {
  success: boolean;
  devFallback: true;
  error?: string;
}

/** Resultado quando não há Resend/SMTP configurado: simulado em dev, falha em produção. */
export function noEmailServiceResult(): NoServiceResult {
  if (process.env.NODE_ENV === "production") {
    return { success: false, devFallback: true, error: "Nenhum serviço de email configurado" };
  }
  return { success: true, devFallback: true };
}
