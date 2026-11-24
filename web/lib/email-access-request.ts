// Aviso ao Master Admin quando chega um novo pedido de acesso à plataforma (/pedir-acesso).
// Usa o Resend (RESEND_API_KEY / RESEND_FROM_EMAIL, já configurados em produção).
// Destinatário: ACCESS_REQUEST_NOTIFY_EMAIL (opcional); por omissão, o email do Master Admin.

const DEFAULT_NOTIFY_EMAIL = "darioleal8@gmail.com";
const APP_URL   = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.hoophub.pt";
const FROM_NAME = "HoopHub";

export interface AccessRequestInfo {
  club_name:    string;
  city:         string;
  category:     string;
  league:       string;
  player_count: number;
  contact_name: string;
  contact_role: string;
  email:        string;
  phone:        string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  "+40": "Veteranos +40",
  "+50": "Veteranos +50",
  outro: "Outro",
};
const ROLE_LABELS: Record<string, string> = {
  dirigente:             "Dirigente",
  treinador:             "Treinador",
  "jogador-organizador": "Jogador-organizador",
};

// Remove BOM e espaços (ficheiros .env gravados no Windows)
function clean(v: string | undefined): string {
  const s = (v ?? "").trim();
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1).trim() : s;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Assunto numa só linha e com limite (os dados vêm de um formulário público)
function oneLine(s: string, max = 80): string {
  return s.replace(/[\r\n]+/g, " ").slice(0, max);
}

export function buildAccessRequestEmail(r: AccessRequestInfo): { subject: string; html: string; text: string } {
  const category = CATEGORY_LABELS[r.category] ?? r.category;
  const role     = ROLE_LABELS[r.contact_role] ?? r.contact_role;
  const link     = `${APP_URL.replace(/\/$/, "")}/master-pedidos`;
  const when     = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" });

  const rows: Array<[string, string]> = [
    ["Clube", r.club_name],
    ["Cidade", r.city],
    ["Escalão", category],
    ["Liga / competição", r.league],
    ["Nº de jogadores", String(r.player_count)],
    ["Contacto", `${r.contact_name} (${role})`],
    ["Email", r.email],
    ["Telefone", r.phone ?? "—"],
    ["Recebido em", when],
  ];

  const subject = `Novo pedido de acesso: ${oneLine(r.club_name)} (${oneLine(r.city, 40)})`;

  const html = `<!doctype html>
<html lang="pt"><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e5e7eb">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#B26016">HoopHub · Master Admin</p>
      <h1 style="margin:0 0 16px;font-size:22px">Novo pedido de acesso</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;width:38%">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-weight:600">${esc(v)}</td></tr>`).join("\n        ")}
      </table>
      <p style="margin:24px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#F28C28;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Ver pedidos</a></p>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">Podes responder a este email para falar diretamente com quem fez o pedido.</p>
    </div>
  </div>
</body></html>`;

  const text = [
    "Novo pedido de acesso ao HoopHub",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Ver pedidos: ${link}`,
  ].join("\n");

  return { subject, html, text };
}

// Nunca lança: uma falha no email não pode impedir o registo do pedido.
export async function sendAccessRequestNotification(r: AccessRequestInfo): Promise<{ success: boolean; error?: string }> {
  try {
    const apiKey = clean(process.env.RESEND_API_KEY);
    if (!apiKey) return { success: false, error: "RESEND_API_KEY não configurada" };

    const to        = clean(process.env.ACCESS_REQUEST_NOTIFY_EMAIL) || DEFAULT_NOTIFY_EMAIL;
    const fromEmail = clean(process.env.RESEND_FROM_EMAIL) || "noreply@hoophub.pt";
    const { subject, html, text } = buildAccessRequestEmail(r);

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from:    `${FROM_NAME} <${fromEmail}>`,
      to,
      replyTo: r.email,
      subject,
      html,
      text,
      headers: { "X-Entity-Ref-ID": `hoophub-access-request-${Date.now()}` },
    });
    if (error) {
      const msg = typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
      return { success: false, error: msg };
    }
    console.log(`[email/access-request] Enviado ✓ id=${data?.id}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
