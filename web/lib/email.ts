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

import { buildActivationEmail } from "./email-templates";

const APP_URL   = process.env.NEXT_PUBLIC_APP_URL  ?? "http://localhost:3000";
const FROM_NAME = "HoopHub";

export interface SendResult {
  success:      boolean;
  messageId?:   string;
  devFallback?: boolean;
  error?:       string;
}

// ─── Resend ──────────────────────────────────────────────────
async function sendWithResend(opts: {
  to: string; subject: string; html: string; text: string;
}): Promise<SendResult> {
  const { Resend } = await import("resend");
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@hoophub.pt";
  const from = `${FROM_NAME} <${fromEmail}>`;
  const apiKey = process.env.RESEND_API_KEY!;
  console.log(`[email/resend] A enviar para ${opts.to} via ${fromEmail}`);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to:       opts.to,
    replyTo:  fromEmail,
    subject:  opts.subject,
    html:     opts.html,
    text:     opts.text,
    headers: {
      "X-Entity-Ref-ID": `hoophub-activation-${Date.now()}`,
    },
  });
  if (error) {
    console.error(`[email/resend] ERRO ao enviar para ${opts.to}:`, error);
    return { success: false, error: error.message };
  }
  console.log(`[email/resend] Enviado com sucesso → id=${data?.id}`);
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
      const r = await sendWithResend({ to: opts.to, subject, html, text });
      if (r.success) return r;
      resendError = r.error;
      console.error("[email] Resend falhou:", r.error);
    } catch (err) {
      resendError = err instanceof Error ? err.message : String(err);
      console.error("[email] Resend erro:", resendError);
    }
    // Resend está configurada mas falhou — não cair em devFallback
    // silenciosamente, isso esconderia o erro real (domínio não
    // verificado, API key inválida, etc.) do admin.
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
