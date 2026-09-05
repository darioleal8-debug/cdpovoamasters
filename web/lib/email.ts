// Serviço de envio de email com suporte a múltiplos provedores.
// Prioridade: Resend → Gmail SMTP → SMTP personalizado → console (dev)
//
// Variáveis de ambiente necessárias (adicionar ao .env.local):
//
//   OPÇÃO A — Gmail (mais fácil):
//     GMAIL_USER=o.teu@gmail.com
//     GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← App Password do Google
//
//   OPÇÃO B — Resend (https://resend.com):
//     RESEND_API_KEY=re_xxxxxxxxxx
//     RESEND_FROM_EMAIL=noreply@hoophub.app
//
//   OPÇÃO C — SMTP personalizado:
//     SMTP_HOST=smtp.exemplo.com
//     SMTP_PORT=587
//     SMTP_USER=utilizador
//     SMTP_PASS=password
//     SMTP_FROM=noreply@hoophub.app
//     SMTP_SECURE=false          (true para porta 465)

import { buildActivationEmail, buildLatePaymentEmail, buildPaymentReceiptEmail, buildPasswordResetEmail } from "./email-templates";

const APP_URL   = process.env.NEXT_PUBLIC_APP_URL  ?? "http://localhost:3000";
const FROM_NAME = "HoopHub";

export interface SendResult {
  success:      boolean;
  messageId?:   string;
  devFallback?: boolean;
  error?:       string;
}

// stripEnv: strip BOM + whitespace de variáveis de ambiente.
// Necessário porque ficheiros .env.local gravados com BOM no Windows
// prepõem U+FEFF invisível que corrompe HTTP headers (erro charCode 65279).
function stripEnv(v: string | undefined, fallback = ""): string {
  const s = (v ?? fallback).trim();
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

// stripBomAll: remove BOM (U+FEFF) wherever it appears in a string.
// Complementa stripEnv (que só remove BOM inicial) para casos em que o BOM
// aparece no interior de uma string usada como valor de cabeçalho HTTP.
function stripBomAll(v: string): string {
  return v.replace(/﻿/g, "");
}

// ─── Resend ──────────────────────────────────────────────────
async function sendWithResend(opts: {
  to: string; subject: string; html: string; text: string; idPrefix?: string;
}): Promise<SendResult> {
  const { Resend } = await import("resend");
  const fromEmail = stripEnv(process.env.RESEND_FROM_EMAIL, "noreply@hoophub.pt");
  const from = stripBomAll(`${FROM_NAME} <${fromEmail}>`);
  const subject = stripBomAll(opts.subject);
  const apiKey = stripEnv(process.env.RESEND_API_KEY);
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");
  console.log(`[email/resend] A enviar para ${opts.to} via ${fromEmail} — "${subject}"`);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to:       opts.to,
    replyTo:  fromEmail,
    subject,
    html:     opts.html,
    text:     opts.text,
    headers: {
      "X-Entity-Ref-ID": `hoophub-${opts.idPrefix ?? "email"}-${Date.now()}`,
    },
  });
  if (error) {
    console.error(`[email/resend] ERRO (${opts.to}):`, JSON.stringify(error));
    return { success: false, error: typeof error === "object" && "message" in error ? (error as {message:string}).message : String(error) };
  }
  console.log(`[email/resend] Enviado ✓ id=${data?.id}`);
  return { success: true, messageId: data?.id };
}

// ─── Nodemailer (Gmail ou SMTP) ──────────────────────────────
async function sendWithNodemailer(opts: {
  to: string; subject: string; html: string; text: string;
}): Promise<SendResult> {
  const nodemailer = await import("nodemailer");
  let transporter: ReturnType<typeof nodemailer.createTransport>;
  let fromAddress: string;

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    // Gmail com App Password
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    fromAddress = `${FROM_NAME} <${process.env.GMAIL_USER}>`;
  } else if (process.env.SMTP_HOST) {
    // SMTP personalizado
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    fromAddress = `${FROM_NAME} <${process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@hoophub.app"}>`;
  } else {
    return { success: false, error: "Nenhum transporte SMTP configurado" };
  }

  const info = await transporter.sendMail({
    from:    fromAddress,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text,
  });

  return { success: true, messageId: info.messageId };
}

// ─── API pública ─────────────────────────────────────────────
export async function sendActivationEmail(opts: {
  to:              string;
  name:            string;
  activationToken: string;
}): Promise<SendResult> {
  const activationLink = `${APP_URL}/activate?token=${opts.activationToken}`;
  const { subject, html, text } = buildActivationEmail({
    name: opts.name,
    activationLink,
    appUrl: APP_URL,
    expiresHours: 24,
  });

  const hasResend     = !!process.env.RESEND_API_KEY;
  const hasNodemailer = !!(process.env.GMAIL_USER || process.env.SMTP_HOST);

  // 1. Resend
  if (hasResend) {
    let resendError: string | undefined;
    try {
      const r = await sendWithResend({ to: opts.to, subject, html, text, idPrefix: "activation" });
      if (r.success) return r;
      resendError = r.error;
      console.error("[email] Resend falhou:", r.error);
    } catch (err) {
      resendError = err instanceof Error ? err.message : String(err);
      console.error("[email] Resend erro:", resendError);
    }
    if (!hasNodemailer) {
      return { success: false, error: resendError ?? "Erro desconhecido ao enviar via Resend" };
    }
  }

  // 2. Gmail ou SMTP
  if (hasNodemailer) {
    try {
      const r = await sendWithNodemailer({ to: opts.to, subject, html, text });
      if (r.success) {
        console.log(`[email] Enviado via ${process.env.GMAIL_USER ? "Gmail" : "SMTP"} → ${opts.to}`);
        return r;
      }
      console.error("[email] Nodemailer falhou:", r.error);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[email] Nodemailer erro:", msg);
      return { success: false, error: msg };
    }
  }

  // 3. Dev fallback — imprime no terminal
  console.log("\n" + "=".repeat(60));
  console.log("[EMAIL DEV] Nenhum serviço de email configurado");
  console.log(`  Para:    ${opts.to}`);
  console.log(`  Assunto: ${subject}`);
  console.log(`  Link:    ${activationLink}`);
  console.log("=".repeat(60) + "\n");
  return { success: true, devFallback: true };
}

export async function sendPasswordResetEmail(opts: {
  to:           string;
  name:         string;
  email:        string;
  tempPassword: string;
}): Promise<SendResult> {
  const { subject, html, text } = buildPasswordResetEmail({
    name:         opts.name,
    email:        opts.email,
    tempPassword: opts.tempPassword,
    appUrl:       APP_URL,
  });

  const hasResend     = !!process.env.RESEND_API_KEY;
  const hasNodemailer = !!(process.env.GMAIL_USER || process.env.SMTP_HOST);

  if (hasResend) {
    let resendError: string | undefined;
    try {
      const r = await sendWithResend({ to: opts.to, subject, html, text, idPrefix: "pwd-reset" });
      if (r.success) return r;
      resendError = r.error;
      console.error("[email] Resend falhou (password reset):", r.error);
    } catch (err) {
      resendError = err instanceof Error ? err.message : String(err);
      console.error("[email] Resend erro (password reset):", resendError);
    }
    if (!hasNodemailer) {
      return { success: false, error: resendError ?? "Erro desconhecido ao enviar via Resend" };
    }
  }

  if (hasNodemailer) {
    try {
      const r = await sendWithNodemailer({ to: opts.to, subject, html, text });
      if (r.success) {
        console.log(`[email] Password reset enviado via ${process.env.GMAIL_USER ? "Gmail" : "SMTP"} → ${opts.to}`);
        return r;
      }
      console.error("[email] Nodemailer falhou (password reset):", r.error);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[email] Nodemailer erro (password reset):", msg);
      return { success: false, error: msg };
    }
  }

  // Dev fallback — nunca expõe a password em produção; aqui só para dev
  console.log("\n" + "=".repeat(60));
  console.log("[EMAIL DEV] Password reset (nenhum serviço configurado)");
  console.log(`  Para:    ${opts.to}`);
  console.log(`  Assunto: ${subject}`);
  console.log(`  [password omitida dos logs]`);
  console.log("=".repeat(60) + "\n");
  return { success: true, devFallback: true };
}

export async function sendLatePaymentEmail(opts: {
  to: string;
  name: string;
  monthsLate: number;
  totalMissing: number;
  seasonName?: string;
}): Promise<SendResult> {
  const { subject, html, text } = buildLatePaymentEmail({
    name: opts.name,
    monthsLate: opts.monthsLate,
    totalMissing: opts.totalMissing,
    appUrl: APP_URL,
    seasonName: opts.seasonName,
  });

  const hasResend     = !!process.env.RESEND_API_KEY;
  const hasNodemailer = !!(process.env.GMAIL_USER || process.env.SMTP_HOST);

  if (hasResend) {
    let resendError: string | undefined;
    try {
      const r = await sendWithResend({ to: opts.to, subject, html, text, idPrefix: "late-payment" });
      if (r.success) return r;
      resendError = r.error;
      console.error("[email] Resend falhou (atraso):", r.error);
    } catch (err) {
      resendError = err instanceof Error ? err.message : String(err);
      console.error("[email] Resend erro (atraso):", resendError);
    }
    if (!hasNodemailer) {
      return { success: false, error: resendError ?? "Erro desconhecido ao enviar via Resend" };
    }
  }

  if (hasNodemailer) {
    try {
      const r = await sendWithNodemailer({ to: opts.to, subject, html, text });
      if (r.success) {
        console.log(`[email] Enviado via ${process.env.GMAIL_USER ? "Gmail" : "SMTP"} → ${opts.to}`);
        return r;
      }
      console.error("[email] Nodemailer falhou:", r.error);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[email] Nodemailer erro:", msg);
      return { success: false, error: msg };
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("[EMAIL DEV] Aviso de quota em atraso (nenhum serviço configurado)");
  console.log(`  Para:    ${opts.to}`);
  console.log(`  Assunto: ${subject}`);
  console.log("=".repeat(60) + "\n");
  return { success: true, devFallback: true };
}

export async function sendPaymentReceiptEmail(opts: {
  to:            string;
  name:          string;
  month:         number;
  year:          number;
  amount:        number;
  paymentDate:   string | null;
  method:        string | null;
  receiptNumber: string;
  clubName:      string;
  temporada:     string;
  pagos:         number;
  totalMeses:    number;
  proximaQuota:  string | null;
}): Promise<SendResult> {
  const { subject, html, text } = buildPaymentReceiptEmail({
    name:          opts.name,
    month:         opts.month,
    year:          opts.year,
    amount:        opts.amount,
    paymentDate:   opts.paymentDate,
    method:        opts.method,
    appUrl:        APP_URL,
    receiptNumber: opts.receiptNumber,
    clubName:      opts.clubName,
    temporada:     opts.temporada,
    pagos:         opts.pagos,
    totalMeses:    opts.totalMeses,
    proximaQuota:  opts.proximaQuota,
  });

  const hasResend     = !!process.env.RESEND_API_KEY;
  const hasNodemailer = !!(process.env.GMAIL_USER || process.env.SMTP_HOST);

  if (hasResend) {
    let resendError: string | undefined;
    try {
      const r = await sendWithResend({ to: opts.to, subject, html, text, idPrefix: "receipt" });
      if (r.success) return r;
      resendError = r.error;
      console.error("[email] Resend falhou (recibo):", r.error);
    } catch (err) {
      resendError = err instanceof Error ? err.message : String(err);
      console.error("[email] Resend erro (recibo):", resendError);
    }
    if (!hasNodemailer) {
      return { success: false, error: resendError ?? "Erro desconhecido ao enviar via Resend" };
    }
  }

  if (hasNodemailer) {
    try {
      const r = await sendWithNodemailer({ to: opts.to, subject, html, text });
      if (r.success) {
        console.log(`[email] Recibo enviado via ${process.env.GMAIL_USER ? "Gmail" : "SMTP"} → ${opts.to}`);
        return r;
      }
      console.error("[email] Nodemailer falhou (recibo):", r.error);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[email] Nodemailer erro (recibo):", msg);
      return { success: false, error: msg };
    }
  }

  // Dev fallback
  const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  console.log("\n" + "=".repeat(60));
  console.log("[EMAIL DEV] Recibo de pagamento (nenhum serviço configurado)");
  console.log(`  Para:    ${opts.to}`);
  console.log(`  Assunto: ${subject}`);
  console.log(`  Mês:     ${MONTHS[(opts.month - 1) % 12]} ${opts.year} — ${opts.amount}€`);
  console.log("=".repeat(60) + "\n");
  return { success: true, devFallback: true };
}
