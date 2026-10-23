import { Resend } from "resend";

function stripBom(v: string | undefined, fallback = ""): string {
  const s = (v ?? fallback).trim();
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export async function sendLigaCredentialsEmail(opts: {
  to: string;
  password: string;
  teamName: string;
  isReset?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = stripBom(process.env.RESEND_API_KEY);
  if (!apiKey) {
    // Dev: não expõe password nos logs, mas não falha o fluxo
    console.log(`[liga/credentials] DEV — RESEND_API_KEY não configurada; email não enviado para ${opts.to}`);
    return { ok: true };
  }

  const fromEmail = stripBom(process.env.RESEND_FROM_EMAIL, "noreply@hoophub.pt");
  const appUrl = stripBom(process.env.NEXT_PUBLIC_APP_URL, "https://www.hoophub.pt");
  const loginUrl = `${appUrl}/liga-inatel/equipa/login`;

  const subject = opts.isReset
    ? `Liga INATEL — Nova palavra-passe para ${opts.teamName}`
    : `Liga INATEL — Acesso criado para ${opts.teamName}`;

  const html = buildHtml({ ...opts, loginUrl });
  const text = buildText({ ...opts, loginUrl });

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `Liga INATEL <${fromEmail}>`,
    to: opts.to,
    subject,
    html,
    text,
    headers: { "X-Entity-Ref-ID": `liga-creds-${Date.now()}` },
  });

  if (error) {
    const msg =
      typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : String(error);
    console.error(`[liga/credentials] Erro ao enviar para ${opts.to}:`, msg);
    return { ok: false, error: msg };
  }

  console.log(`[liga/credentials] Credenciais enviadas para ${opts.to}`);
  return { ok: true };
}

function buildHtml(opts: {
  to: string;
  password: string;
  teamName: string;
  isReset?: boolean;
  loginUrl: string;
}): string {
  const intro = opts.isReset
    ? "A palavra-passe da tua conta de delegado foi <strong>redefinida</strong>. Abaixo encontras as novas credenciais de acesso à Liga INATEL."
    : "A tua conta de delegado foi <strong>criada</strong>. Abaixo encontras as credenciais de acesso à Liga INATEL.";

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F6F2EC;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F2EC;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0"
       style="max-width:560px;width:100%;background:#fff;border-radius:12px;
              box-shadow:0 2px 12px rgba(0,0,0,.08);overflow:hidden;">
  <tr>
    <td style="background:#F97316;padding:20px 32px;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:.14em;
                text-transform:uppercase;color:rgba(255,255,255,.8);font-family:monospace;">LIGA INATEL</p>
      <h1 style="margin:4px 0 0;font-size:20px;font-weight:800;color:#fff;
                 text-transform:uppercase;letter-spacing:.04em;">${opts.teamName}</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 32px 28px;">
      <p style="margin:0 0 24px;font-size:14px;color:#3D3630;line-height:1.6;">${intro}</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#F6F2EC;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:16px 20px 12px;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:.1em;
                      text-transform:uppercase;color:#6F675F;font-family:monospace;">Email</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#1A1612;font-family:monospace;">${opts.to}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 20px 16px;border-top:1px solid #E8E0D4;">
            <p style="margin:12px 0 4px;font-size:10px;font-weight:700;letter-spacing:.1em;
                      text-transform:uppercase;color:#6F675F;font-family:monospace;">Palavra-passe</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#F97316;font-family:monospace;
                      letter-spacing:.12em;">${opts.password}</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 24px;font-size:13px;color:#6F675F;line-height:1.5;">
        Após o primeiro acesso, ser-te-á pedido que defines uma nova palavra-passe pessoal.
      </p>

      <a href="${opts.loginUrl}"
         style="display:inline-block;background:#F97316;color:#fff;
                font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
                text-decoration:none;padding:12px 28px;border-radius:8px;">
        Iniciar Sessão →
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px;border-top:1px solid #F0EBE3;">
      <p style="margin:0;font-size:11px;color:#8C837A;line-height:1.5;">
        Email enviado automaticamente pelo sistema Liga INATEL — HoopHub.<br>
        Se não reconheces esta conta, podes ignorar este email.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildText(opts: {
  to: string;
  password: string;
  teamName: string;
  isReset?: boolean;
  loginUrl: string;
}): string {
  const intro = opts.isReset
    ? "A palavra-passe da tua conta de delegado foi redefinida."
    : "A tua conta de delegado foi criada.";

  return `${intro}

CREDENCIAIS DE ACESSO — ${opts.teamName}
Email: ${opts.to}
Palavra-passe: ${opts.password}

Após o primeiro acesso, ser-te-á pedido que defines uma nova palavra-passe pessoal.

Iniciar Sessão: ${opts.loginUrl}

---
Email enviado automaticamente pelo sistema Liga INATEL — HoopHub.`;
}
