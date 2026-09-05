// Templates HTML para emails HoopHub (ativação, pagamentos, avisos).
// Design table-based para compatibilidade com clientes de email.
// Usa design table-based para compatibilidade com clientes de email.

export function buildActivationEmail(opts: {
  name: string;
  activationLink: string;
  appUrl: string;
  expiresHours?: number;
}): { subject: string; html: string; text: string } {
  const { name, activationLink, appUrl, expiresHours = 24 } = opts;
  const logoUrl = `${appUrl}/assets/logo/hoophub.png`;
  const firstName = name.split(" ")[0];

  const subject = `${firstName}, a tua conta HoopHub está pronta`;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Cabeçalho azul com logo -->
          <tr>
            <td align="center"
                style="background:linear-gradient(160deg,#0A1A2F 0%,#061020 100%);
                       padding:32px 40px 28px;">
              <img
                src="${logoUrl}"
                alt="HoopHub"
                width="140"
                height="auto"
                style="display:block;max-width:140px;height:auto;"
              />
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0A1A2F;
                         line-height:1.3;">
                Bem-vindo à HoopHub, ${firstName}!
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                A tua conta foi criada com sucesso. Para começares a usar a plataforma,
                precisas de ativar a tua conta clicando no botão abaixo.
              </p>

              <!-- Botão CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0"
                     style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${activationLink}"
                       style="display:inline-block;padding:14px 36px;
                              background:#F28C28;color:#ffffff;
                              font-size:15px;font-weight:700;
                              text-decoration:none;border-radius:8px;
                              letter-spacing:0.3px;">
                      Ativar Conta
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Aviso de expiração -->
              <p style="margin:0 0 20px;font-size:13px;color:#888;line-height:1.5;
                        padding:12px 16px;background:#f8f9fa;border-radius:6px;
                        border-left:3px solid #F28C28;">
                Este link é válido durante <strong>${expiresHours} horas</strong>.
                Após esse prazo, pede ao administrador que envie um novo acesso.
              </p>

              <!-- Fallback URL -->
              <p style="margin:0 0 8px;font-size:12px;color:#aaa;line-height:1.5;">
                Se o botão não funcionar, copia e cola este link no browser:
              </p>
              <p style="margin:0;font-size:12px;word-break:break-all;">
                <a href="${activationLink}" style="color:#1E3A5F;">${activationLink}</a>
              </p>

            </td>
          </tr>

          <!-- Separador -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #eee;margin:0;" />
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding:20px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#bbb;">
                Recebeste este email porque o teu treinador criou uma conta para ti na plataforma HoopHub.
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#bbb;">
                Se não reconheces este convite, podes ignorar este email em segurança.
              </p>
              <p style="margin:0;font-size:11px;color:#ccc;">
                HoopHub · <a href="${appUrl}" style="color:#ccc;">hoophub.pt</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <!-- Footer externo -->
        <p style="margin:20px 0 0;font-size:11px;color:#aaa;text-align:center;">
          © ${new Date().getFullYear()} HoopHub · Todos os direitos reservados
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `Bem-vindo à HoopHub, ${firstName}!

A tua conta foi criada. Para a ativares, acede ao link abaixo:
${activationLink}

Este link expira em ${expiresHours} horas.

Se não reconheces este registo, ignora este email.
`;

  return { subject, html, text };
}

export function buildLatePaymentEmail(opts: {
  name: string;
  monthsLate: number;
  totalMissing: number;
  appUrl: string;
  seasonName?: string;
}): { subject: string; html: string; text: string } {
  const { name, monthsLate, totalMissing, appUrl, seasonName } = opts;
  const firstName = name.split(" ")[0];
  const paymentsUrl = `${appUrl}/player/meus-pagamentos`;
  const logoUrl = `${appUrl}/assets/logo/hoophub.png`;
  const missingStr = totalMissing > 0 ? `${totalMissing.toFixed(2)}€` : "";

  const subject = `${firstName}, tens ${monthsLate} quota${monthsLate > 1 ? "s" : ""} em atraso`;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">

          <tr>
            <td align="center"
                style="background:linear-gradient(160deg,#0A1A2F 0%,#061020 100%);
                       padding:32px 40px 28px;">
              <img src="${logoUrl}" alt="HoopHub" width="140" height="auto"
                   style="display:block;max-width:140px;height:auto;" />
            </td>
          </tr>

          <tr>
            <td style="background:#fef3c7;padding:14px 40px;border-bottom:2px solid #f59e0b;">
              <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;text-align:center;">
                &#9888;&#65039; Quotas em Atraso${seasonName ? ` — ${seasonName}` : ""}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0A1A2F;line-height:1.3;">
                Ol&#225;, ${firstName}!
              </h1>
              <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6;">
                Verificámos que tens <strong>${monthsLate} quota${monthsLate > 1 ? "s" : ""} em atraso</strong>${missingStr ? ` (${missingStr} em dívida)` : ""}.
                Enquanto não regularizares a situação, não poderás ser incluído nas convocatórias para jogos.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="margin:0 0 28px;background:#fef9ec;border-radius:8px;
                            border:1px solid #fcd34d;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#78350f;font-weight:600;">Quotas em atraso</td>
                        <td align="right" style="font-size:16px;color:#92400e;font-weight:800;">
                          ${monthsLate} m${monthsLate > 1 ? "eses" : "ês"}
                        </td>
                      </tr>
                      ${missingStr ? `<tr>
                        <td style="font-size:13px;color:#78350f;font-weight:600;padding-top:6px;">Valor em d&#237;vida</td>
                        <td align="right" style="font-size:16px;color:#92400e;font-weight:800;padding-top:6px;">${missingStr}</td>
                      </tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${paymentsUrl}"
                       style="display:inline-block;padding:14px 36px;
                              background:#F28C28;color:#ffffff;
                              font-size:15px;font-weight:700;
                              text-decoration:none;border-radius:8px;
                              letter-spacing:0.3px;">
                      Ver Os Meus Pagamentos
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#888;line-height:1.5;
                        padding:12px 16px;background:#f8f9fa;border-radius:6px;
                        border-left:3px solid #F28C28;">
                Se já efetuaste o pagamento e achas que este aviso é um engano,
                fala com o teu treinador ou administrador para regularizar a situação na plataforma.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #eee;margin:0;" />
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#bbb;">
                Recebeste este aviso automático da plataforma HoopHub do CD Póvoa.
              </p>
              <p style="margin:0;font-size:11px;color:#ccc;">
                HoopHub · <a href="${appUrl}" style="color:#ccc;">hoophub.pt</a>
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0;font-size:11px;color:#aaa;text-align:center;">
          &copy; ${new Date().getFullYear()} HoopHub &middot; Todos os direitos reservados
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Olá, ${firstName}!

Tens ${monthsLate} quota${monthsLate > 1 ? "s" : ""} em atraso${missingStr ? ` (${missingStr} em dívida)` : ""}.

Enquanto não regularizares a situação, não poderás ser incluído nas convocatórias para jogos.

Acede à plataforma para ver o estado dos teus pagamentos:
${paymentsUrl}

Se já efetuaste o pagamento, fala com o teu treinador para regularizar a situação.

HoopHub · hoophub.pt
`;

  return { subject, html, text };
}

// ─── Reposição de password ───────────────────────────────────

export function buildPasswordResetEmail(opts: {
  name:          string;
  email:         string;
  tempPassword:  string;
  appUrl:        string;
}): { subject: string; html: string; text: string } {
  const { name, email, tempPassword, appUrl } = opts;
  const firstName = name.split(" ")[0];
  const loginUrl  = `${appUrl}/login`;
  const logoUrl   = `${appUrl}/assets/logo/hoophub.png`;

  const subject = `${firstName}, a tua nova password temporária — HoopHub`;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Cabeçalho -->
          <tr>
            <td align="center"
                style="background:linear-gradient(160deg,#0A1A2F 0%,#061020 100%);
                       padding:32px 40px 28px;">
              <img src="${logoUrl}" alt="HoopHub" width="140" height="auto"
                   style="display:block;max-width:140px;height:auto;" />
            </td>
          </tr>

          <!-- Banner laranja -->
          <tr>
            <td style="background:#fff7ed;padding:14px 40px;border-bottom:2px solid #F97316;">
              <p style="margin:0;font-size:14px;font-weight:700;color:#9a3412;text-align:center;">
                &#128273; Nova Password Tempor&#225;ria
              </p>
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0A1A2F;line-height:1.3;">
                Ol&#225;, ${firstName}!
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                O administrador repôs a tua password de acesso ao HoopHub.
                Usa as credenciais abaixo para entrar na plataforma.
              </p>

              <!-- Caixa de credenciais -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="margin:0 0 28px;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
                <tr>
                  <td colspan="2"
                      style="padding:12px 20px;background:#f9fafb;
                             font-size:12px;font-weight:700;color:#6b7280;
                             text-transform:uppercase;letter-spacing:0.5px;">
                    As tuas credenciais de acesso
                  </td>
                </tr>
                <tr style="border-top:1px solid #f3f4f6;">
                  <td style="padding:12px 20px;font-size:14px;color:#374151;font-weight:600;width:40%;">
                    Email
                  </td>
                  <td style="padding:12px 20px;font-size:14px;color:#111827;font-weight:500;font-family:monospace;">
                    ${email}
                  </td>
                </tr>
                <tr style="border-top:1px solid #f3f4f6;background:#fff7ed;">
                  <td style="padding:12px 20px;font-size:14px;color:#374151;font-weight:600;">
                    Password tempor&#225;ria
                  </td>
                  <td style="padding:12px 20px;font-size:18px;color:#9a3412;font-weight:800;
                             font-family:monospace;letter-spacing:0.08em;">
                    ${tempPassword}
                  </td>
                </tr>
              </table>

              <!-- Botão CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0"
                     style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}"
                       style="display:inline-block;padding:14px 36px;
                              background:#F28C28;color:#ffffff;
                              font-size:15px;font-weight:700;
                              text-decoration:none;border-radius:8px;
                              letter-spacing:0.3px;">
                      Entrar no HoopHub
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Aviso de segurança -->
              <p style="margin:0;font-size:13px;color:#888;line-height:1.5;
                        padding:12px 16px;background:#fff7ed;border-radius:6px;
                        border-left:3px solid #F97316;">
                &#9888; Por raz&#245;es de seguran&#231;a, ser&#225;s obrigado a alterar esta
                password assim que entrares na plataforma. A password tempor&#225;ria &#233;
                de uso &#250;nico.
              </p>
            </td>
          </tr>

          <!-- Separador -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #eee;margin:0;" />
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding:20px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#bbb;">
                Recebeste este email porque o administrador da tua equipa repôs a tua password HoopHub.
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#bbb;">
                Se não reconheces esta ação, contacta imediatamente o teu administrador.
              </p>
              <p style="margin:0;font-size:11px;color:#ccc;">
                HoopHub &#183; <a href="${appUrl}" style="color:#ccc;">hoophub.pt</a>
              </p>
            </td>
          </tr>

        </table>

        <p style="margin:20px 0 0;font-size:11px;color:#aaa;text-align:center;">
          &copy; ${new Date().getFullYear()} HoopHub &middot; Todos os direitos reservados
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Olá, ${firstName}!

O administrador repôs a tua password de acesso ao HoopHub.

Credenciais de acesso:
  Email:              ${email}
  Password temporária: ${tempPassword}

Acede ao HoopHub: ${loginUrl}

Por razões de segurança, serás obrigado a alterar esta password assim que entrares na plataforma.

Se não reconheces esta ação, contacta o teu administrador imediatamente.

HoopHub · ${appUrl}
`;

  return { subject, html, text };
}

// ─── Recibo de pagamento mensal ─────────────────────────────

const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const MONTHS_PT_GENITIVO = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

const METHOD_LABELS: Record<string, string> = {
  "numerário":     "Numerário",
  "transferência": "Transferência bancária",
  "mbway":         "MBWay",
  "cheque":        "Cheque",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtAmount(v: number): string {
  return `${Number(v).toFixed(2)} €`;
}

export function buildPaymentReceiptEmail(opts: {
  name:          string;
  month:         number;   // 1–12
  year:          number;
  amount:        number;
  paymentDate:   string | null;
  method:        string | null;
  appUrl:        string;
  receiptNumber: string;         // AAAA-MM-NNN
  clubName:      string;
  temporada:     string;         // e.g. "2025/26"
  pagos:         number;         // quotas pagas nesta temporada (incluindo esta)
  totalMeses:    number;         // total de meses da temporada
  proximaQuota:  string | null;  // e.g. "1 de outubro de 2025"
}): { subject: string; html: string; text: string } {
  const {
    name, month, year, amount, paymentDate, method, appUrl,
    receiptNumber, clubName, temporada, pagos, totalMeses, proximaQuota,
  } = opts;

  const firstName      = name.split(" ")[0];
  const monthName      = MONTHS_PT[(month - 1) % 12];
  const monthNameUpper = monthName.toUpperCase();
  const logoUrl        = `${appUrl}/assets/logo/hoophub.png`;
  const accountUrl     = `${appUrl}/player/minha-area`;
  const amountStr      = fmtAmount(amount);
  const dateStr        = fmtDate(paymentDate);
  const methodLabel    = method ? (METHOD_LABELS[method.toLowerCase()] ?? method) : null;

  const subject = `Quota de ${monthName} ${year} paga — ${amountStr} · ${clubName}`;

  // ── Season progress bar ─────────────────────────────────────────
  const clampedPagos = Math.min(pagos, totalMeses);
  const barCellW     = Math.max(1, Math.floor((520 - (totalMeses - 1) * 4) / totalMeses));
  const barCells     = Array.from({ length: totalMeses }, (_, i) => {
    const paid = i < clampedPagos;
    return `<td width="${barCellW}" height="6"
      style="width:${barCellW}px;height:6px;line-height:6px;font-size:0;
             background-color:${paid ? "#f97316" : "#2e3138"};
             border-radius:2px;mso-line-height-rule:exactly;">&nbsp;</td>
    <td width="4" style="width:4px;font-size:0;line-height:0;">&nbsp;</td>`;
  }).join("");

  // ── Method row (omit if unknown) ────────────────────────────────
  const methodRow = methodLabel ? `
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #2e3138;
                               font-size:12px;color:#8b8f98;font-family:Helvetica,Arial,sans-serif;">
                      M&eacute;todo
                    </td>
                    <td align="right" style="padding:10px 0;border-top:1px solid #2e3138;
                               font-size:14px;font-weight:600;color:#f4f4f5;
                               font-family:Helvetica,Arial,sans-serif;">
                      ${methodLabel}
                    </td>
                  </tr>` : "";

  // ── Próxima quota (omit if null) ────────────────────────────────
  const proximaRow = proximaQuota ? `
          <!-- Próxima quota -->
          <tr>
            <td style="padding:0 28px 20px;background-color:#17181c;">
              <p style="margin:0;font-size:12px;color:#8b8f98;font-family:Helvetica,Arial,sans-serif;">
                Pr&oacute;xima quota:&nbsp;
                <span style="color:#f4f4f5;font-weight:600;">${proximaQuota}</span>
              </p>
            </td>
          </tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="pt" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${subject}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0c0d10;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader -->
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Quota de ${monthName} ${year} confirmada — ${amountStr} · ${clubName}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </span>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#0c0d10;padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- Card 600px -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background-color:#17181c;
                      border-radius:16px;overflow:hidden;">

          <!-- ── Header: logo + PAGO badge ────────────────────── -->
          <tr>
            <td style="padding:24px 28px;border-bottom:1px solid #2e3138;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <img src="${logoUrl}" alt="${clubName}" width="108" height="auto"
                         style="display:block;max-width:108px;height:auto;border:0;" />
                  </td>
                  <td align="right" valign="middle">
                    <span style="display:inline-block;background-color:#132a1c;color:#4ade80;
                                 font-size:10px;font-weight:700;letter-spacing:1.5px;
                                 padding:5px 12px;border-radius:99px;text-transform:uppercase;
                                 font-family:Helvetica,Arial,sans-serif;
                                 mso-line-height-rule:exactly;">
                      &#10003;&nbsp;PAGO
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Value block ───────────────────────────────────── -->
          <tr>
            <td style="background-color:#1f2126;padding:24px 28px;
                       border-bottom:1px solid #2e3138;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:1px;
                         text-transform:uppercase;color:#8b8f98;
                         font-family:Helvetica,Arial,sans-serif;mso-line-height-rule:exactly;">
                Quota de ${monthNameUpper} ${year}
              </p>
              <p style="margin:0;font-size:42px;font-weight:800;color:#ffffff;line-height:1.1;
                         font-family:Helvetica,Arial,sans-serif;mso-line-height-rule:exactly;">
                ${amountStr}
              </p>
            </td>
          </tr>

          <!-- ── Details ───────────────────────────────────────── -->
          <tr>
            <td style="padding:4px 28px;border-bottom:1px solid #2e3138;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:10px 0;font-size:12px;color:#8b8f98;
                             font-family:Helvetica,Arial,sans-serif;">
                    M&ecirc;s
                  </td>
                  <td align="right" style="padding:10px 0;font-size:14px;font-weight:600;
                             color:#f4f4f5;font-family:Helvetica,Arial,sans-serif;">
                    ${monthName} ${year}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #2e3138;
                             font-size:12px;color:#8b8f98;font-family:Helvetica,Arial,sans-serif;">
                    Data
                  </td>
                  <td align="right" style="padding:10px 0;border-top:1px solid #2e3138;
                             font-size:14px;font-weight:600;color:#f4f4f5;
                             font-family:Helvetica,Arial,sans-serif;">
                    ${dateStr}
                  </td>
                </tr>
                ${methodRow}
                <tr>
                  <td style="padding:10px 0;border-top:1px solid #2e3138;
                             font-size:12px;color:#8b8f98;font-family:Helvetica,Arial,sans-serif;">
                    Recibo n&ordm;
                  </td>
                  <td align="right" style="padding:10px 0;border-top:1px solid #2e3138;
                             font-size:13px;font-weight:600;color:#f4f4f5;
                             font-family:'Courier New',monospace,Helvetica,Arial;">
                    ${receiptNumber}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Season bar ─────────────────────────────────────── -->
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid #2e3138;background-color:#17181c;">
              <p style="margin:0 0 10px;font-size:11px;color:#8b8f98;
                         font-family:Helvetica,Arial,sans-serif;mso-line-height-rule:exactly;">
                Temporada ${temporada} &mdash; ${clampedPagos}/${totalMeses} quotas pagas
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>${barCells}</tr>
              </table>
            </td>
          </tr>

          ${proximaRow}

          <!-- ── CTA button (bulletproof) ───────────────────────── -->
          <tr>
            <td style="padding:${proximaQuota ? "4px" : "20px"} 28px 28px;background-color:#17181c;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="#f97316" style="border-radius:8px;mso-padding-alt:0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                      xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${accountUrl}" style="height:46px;v-text-anchor:middle;width:180px;"
                      arcsize="17%" strokecolor="#f97316" fillcolor="#f97316">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;
                                     font-size:14px;font-weight:700;">
                        Ver a minha conta
                      </center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${accountUrl}" target="_blank"
                       style="display:block;padding:14px 28px;color:#ffffff;font-size:14px;
                              font-weight:700;text-decoration:none;border-radius:8px;
                              font-family:Helvetica,Arial,sans-serif;mso-hide:all;">
                      Ver a minha conta
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Footer ────────────────────────────────────────── -->
          <tr>
            <td style="padding:18px 28px;border-top:1px solid #2e3138;background-color:#17181c;">
              <p style="margin:0;font-size:11px;color:#8b8f98;text-align:center;
                         font-family:Helvetica,Arial,sans-serif;">
                ${clubName} &middot; HoopHub &middot;
                <a href="${appUrl}" target="_blank"
                   style="color:#8b8f98;text-decoration:underline;">${appUrl.replace(/^https?:\/\//, "")}</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

  const methodLine    = methodLabel ? `\n- Método:    ${methodLabel}` : "";
  const proximaLine   = proximaQuota ? `\nPróxima quota: ${proximaQuota}` : "";

  const text = `Quota de ${monthName} ${year} confirmada — ${clubName}

${firstName}, o pagamento da tua quota de ${monthName} ${year} foi registado com sucesso.

Detalhes:
- Mês:        ${monthName} ${year}
- Valor:      ${amountStr}
- Data:       ${dateStr}${methodLine}
- Recibo nº:  ${receiptNumber}

Temporada ${temporada}: ${clampedPagos}/${totalMeses} quotas pagas.${proximaLine}

Acede à tua área: ${accountUrl}

${clubName} · HoopHub · ${appUrl}
`;

  return { subject, html, text };
}
