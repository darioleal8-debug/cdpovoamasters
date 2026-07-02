// Template HTML para o email de ativação de conta HoopHub.
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
