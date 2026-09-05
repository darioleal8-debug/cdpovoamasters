import { Calendar, CreditCard, BarChart3 } from "lucide-react";

// ─── Textura de fundo ─────────────────────────────────────────
function BgTexture() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="diag" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="40" stroke="#F28C28" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#diag)" />
      <circle cx="50%" cy="60%" r="260" fill="none" stroke="#F28C28" strokeWidth="1.5" opacity="0.4" />
      <circle cx="50%" cy="60%" r="70"  fill="none" stroke="#F28C28" strokeWidth="1"   opacity="0.25" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: Calendar,
    title: "Ninguém falta por esquecimento",
    body:  "Convocatórias, respostas e confirmações no telemóvel.",
  },
  {
    icon: CreditCard,
    title: "Quotas sem conversas difíceis",
    body:  "Quem pagou, quem falta — tudo numa grelha, lembretes privados.",
  },
  {
    icon: BarChart3,
    title: "Estatística marcada em jogo",
    body:  "Três toques por ação. Funciona sem rede. Ficha pronta no final.",
  },
];

export function LoginPanelLeft() {
  return (
    <div
      className="relative hidden lg:flex w-[58%] flex-col justify-between overflow-hidden p-14"
      style={{ background: "#0A1220" }}
    >
      <BgTexture />

      {/* ── Logo hoophub ── */}
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-12">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-black text-lg"
            style={{ background: "#F28C28" }}
            aria-hidden="true"
          >
            ◉
          </span>
          <span className="font-black text-[22px] text-white">
            hoop<span style={{ color: "#F28C28" }}>hub</span>
          </span>
        </div>

        {/* Título */}
        <h1
          className="font-black text-white leading-none mb-4"
          style={{ fontSize: "clamp(42px, 4.5vw, 68px)", letterSpacing: "-.03em" }}
        >
          <span className="block">Gerir</span>
          <span className="block">uma equipa</span>
          <span className="block" style={{ color: "#F28C28" }}>devia ser</span>
          <span className="block">mais simples.</span>
        </h1>

        <p
          className="text-[15px] leading-relaxed max-w-sm"
          style={{ color: "rgba(255,255,255,.55)" }}
        >
          Plantel, convocatórias, quotas e estatística num só sítio.
          Feito para clubes de veteranos que se gerem a si próprios.
        </p>
      </div>

      {/* ── Três funções ── */}
      <div className="relative z-10 flex flex-col gap-5 my-10">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-4">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(242,140,40,.15)" }}
            >
              <Icon className="h-4 w-4" style={{ color: "#F28C28" }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[14px] font-bold text-white leading-snug">{title}</p>
              <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,.45)" }}>{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Rodapé ── */}
      <p className="relative z-10 text-[12px]" style={{ color: "rgba(255,255,255,.25)" }}>
        Entrada por convite ·{" "}
        <a href="/pedir-acesso" className="underline hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,.45)" }}>
          pedir acesso para o meu clube
        </a>
      </p>
    </div>
  );
}
